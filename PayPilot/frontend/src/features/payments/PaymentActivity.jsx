import { api } from '../../lib/apiClient'
import { useApi } from '../../hooks/useApi'
import { formatDateTime, formatMoney } from '../../lib/format'
import { Card } from '../../components/ui'

const LABELS = {
  invoice_issued: 'Invoice issued',
  invoice_cancelled: 'Invoice cancelled',
  checkout_started: 'Customer started PayPal checkout',
  payment_pending: 'Payment pending at PayPal',
  payment_completed: 'Payment completed (verified with PayPal)',
  payment_declined: 'Payment declined',
  payment_failed: 'Payment failed',
  payment_refunded: 'Payment refunded',
  payment_reversed: 'Payment reversed',
  reminder_marked_sent: 'Reminder marked as sent',
}

const SOURCES = { owner: 'You', system: 'PayPilot', paypal_api: 'PayPal API', paypal_webhook: 'PayPal webhook' }

export default function PaymentActivity({ invoiceId, limit = 20 }) {
  const query = new URLSearchParams({ limit: String(limit) })
  if (invoiceId) query.set('invoice_id', invoiceId)
  const { data, error } = useApi((signal) => api.get(`/v1/payments/activity?${query}`, { signal }), [invoiceId, limit])

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-slate-900">Payment activity</h2>
      {error ? (
        <p className="mt-2 text-sm text-red-600">{error.message}</p>
      ) : !data ? (
        <p className="mt-2 text-sm text-slate-500">Loading…</p>
      ) : data.items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No activity yet.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {data.items.map((ev) => (
            <li key={ev.id} className="border-l-2 border-slate-200 pl-3">
              <p className="text-sm text-slate-900">{LABELS[ev.event_type] ?? ev.event_type}</p>
              <p className="text-xs text-slate-500">
                {formatDateTime(ev.occurred_at)} · {SOURCES[ev.source] ?? ev.source}
                {ev.amount && ` · ${formatMoney(ev.amount, ev.currency)}`}
                {!invoiceId && ev.invoice_number && ` · ${ev.invoice_number}`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
