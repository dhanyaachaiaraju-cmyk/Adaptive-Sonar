import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js'
import { api } from '../lib/apiClient'
import { formatDate, formatDateTime, formatMoney } from '../lib/format'
import { ErrorBanner, StatusBadge } from '../components/ui'
import Spinner from '../components/Spinner'

export default function PayInvoicePage() {
  const { token } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [result, setResult] = useState(null) // server-verified outcome
  const [payError, setPayError] = useState(null)
  const [processing, setProcessing] = useState(false)

  const load = useCallback(
    (signal) =>
      api
        .get(`/v1/public/invoices/${encodeURIComponent(token)}`, { auth: false, signal })
        .then(setInvoice)
        .catch((err) => err.name !== 'AbortError' && setLoadError(err)),
    [token],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (loadError) {
    return (
      <Shell>
        <ErrorBanner error={loadError.status === 404 ? 'This payment link is invalid or no longer available.' : loadError} />
      </Shell>
    )
  }
  if (!invoice) return <Shell><Spinner label="Loading invoice" /></Shell>

  const payable = invoice.status === 'pending' && invoice.paypal

  return (
    <Shell>
      <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Invoice from</p>
            <p className="text-lg font-semibold text-slate-900">{invoice.business_name || 'Your supplier'}</p>
            {invoice.business_email && <p className="text-sm text-slate-500">{invoice.business_email}</p>}
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">{invoice.invoice_number}</p>
            <StatusBadge status={invoice.display_status} />
          </div>
        </header>

        <dl className="mt-6 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-slate-500">Billed to</dt><dd className="text-right font-medium">{invoice.customer_name}</dd>
          <dt className="text-slate-500">Issued</dt><dd className="text-right">{formatDate(invoice.issue_date)}</dd>
          <dt className="text-slate-500">Due</dt><dd className="text-right">{formatDate(invoice.due_date)}</dd>
        </dl>

        <table className="mt-6 w-full text-left text-sm">
          <tbody className="divide-y divide-slate-100">
            {invoice.items.map((it, i) => (
              <tr key={i}>
                <td className="py-2 pr-2">{it.description}<span className="block text-xs text-slate-500">{it.quantity} × {formatMoney(it.unit_price, invoice.currency)}</span></td>
                <td className="py-2 text-right tabular-nums">{formatMoney(it.amount, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="tabular-nums">{formatMoney(invoice.subtotal, invoice.currency)}</dd></div>
          {Number(invoice.tax_amount) > 0 && (
            <div className="flex justify-between"><dt className="text-slate-500">Tax ({Number(invoice.tax_rate)}%)</dt><dd className="tabular-nums">{formatMoney(invoice.tax_amount, invoice.currency)}</dd></div>
          )}
          <div className="flex justify-between text-base font-semibold"><dt>Total due</dt><dd className="tabular-nums">{formatMoney(invoice.total, invoice.currency)}</dd></div>
        </dl>
        {invoice.notes && <p className="mt-4 whitespace-pre-wrap text-xs text-slate-500">{invoice.notes}</p>}
      </article>

      <section className="mt-6">
        {invoice.status === 'paid' ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
            <p className="font-semibold">Payment received</p>
            <p className="mt-1 text-sm">This invoice was paid{invoice.paid_at ? ` on ${formatDateTime(invoice.paid_at)}` : ''}. Payment verified with PayPal.</p>
          </div>
        ) : invoice.status === 'cancelled' ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">This invoice has been cancelled and can no longer be paid.</p>
        ) : invoice.status === 'refunded' ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">This invoice was paid and later refunded.</p>
        ) : !invoice.paypal ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            {invoice.online_payment_unavailable || "Online payment isn't available for this invoice."} Contact {invoice.business_name || 'the sender'} for payment options.
          </p>
        ) : result?.status === 'pending' ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
            <p className="font-semibold">Payment processing</p>
            <p className="mt-1 text-sm">PayPal is still processing your payment. It is <strong>not confirmed yet</strong>. You'll see it as paid here once PayPal completes it.</p>
          </div>
        ) : (
          payable && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              {invoice.paypal.environment === 'sandbox' && (
                <p className="mb-3 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  Test mode (PayPal Sandbox). Use a PayPal Sandbox personal account — no real money moves.
                </p>
              )}
              <ErrorBanner error={payError} className="mb-3" />
              {processing && <div className="mb-3"><Spinner label="Confirming your payment with PayPal" /></div>}
              <PayPalScriptProvider options={{ clientId: invoice.paypal.client_id, currency: invoice.currency, intent: 'capture' }}>
                <PayPalButtons
                  style={{ layout: 'vertical', label: 'pay' }}
                  disabled={processing}
                  createOrder={async () => {
                    setPayError(null)
                    const res = await api.post(`/v1/public/invoices/${encodeURIComponent(token)}/paypal/orders`, undefined, { auth: false })
                    return res.order_id
                  }}
                  onApprove={async (data, actions) => {
                    setProcessing(true)
                    try {
                      const res = await api.post(
                        `/v1/public/invoices/${encodeURIComponent(token)}/paypal/orders/${encodeURIComponent(data.orderID)}/capture`,
                        undefined,
                        { auth: false },
                      )
                      if (res.status === 'instrument_declined') {
                        setPayError(res.message)
                        return actions.restart()
                      }
                      setResult(res)
                      if (res.status === 'completed' || res.status === 'already_paid') await load()
                      else if (res.status !== 'pending') setPayError(res.message)
                    } catch (err) {
                      setPayError(err)
                    } finally {
                      setProcessing(false)
                    }
                  }}
                  onCancel={() => setPayError('Payment was cancelled. You can try again whenever you are ready.')}
                  onError={() => setPayError('PayPal could not start the payment. Please try again.')}
                />
              </PayPalScriptProvider>
            </div>
          )
        )}
      </section>
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="min-h-full bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        {children}
        <p className="mt-8 text-center text-xs text-slate-400">Secure payment powered by PayPal · Invoicing by PayPilot</p>
      </div>
    </div>
  )
}
