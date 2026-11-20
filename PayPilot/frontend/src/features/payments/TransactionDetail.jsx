import { Link } from 'react-router-dom'
import { api } from '../../lib/apiClient'
import { useApi } from '../../hooks/useApi'
import { formatDateTime, formatMoney } from '../../lib/format'
import { paymentStatusInfo } from '../../lib/paymentStatus'
import { ErrorBanner, StatusBadge } from '../../components/ui'
import Spinner from '../../components/Spinner'

const EVENT_LABELS = {
  checkout_started: 'Checkout started',
  payment_pending: 'Payment pending at PayPal',
  payment_completed: 'Payment completed (verified with PayPal)',
  payment_declined: 'Payment declined',
  payment_failed: 'Payment failed',
  payment_refunded: 'Refund',
  payment_reversed: 'Payment reversed',
}
const SOURCES = { owner: 'You', system: 'PayPilot', paypal_api: 'PayPal API', paypal_webhook: 'PayPal webhook (verified)' }
const VERIFIED_VIA = { capture_api: 'PayPal capture response', webhook: 'Verified PayPal webhook', order_lookup: 'PayPal order lookup' }

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 break-all text-slate-900">{children ?? '—'}</dd>
    </div>
  )
}

export default function TransactionDetail({ paymentId }) {
  const { data: tx, error, loading } = useApi((signal) => api.get(`/v1/tracker/transactions/${paymentId}`, { signal }), [paymentId])
  if (loading && !tx) return <Spinner label="Loading transaction" />
  if (error) return <ErrorBanner error={error} />
  const info = paymentStatusInfo(tx.status)

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-lg font-semibold tabular-nums">{formatMoney(tx.amount, tx.currency)}</p>
        <StatusBadge status={info.badge} label={info.label} title={info.help} />
      </div>
      <p className="text-xs text-slate-500">{info.help}</p>
      <dl className="divide-y divide-slate-100">
        <Row label="Invoice">
          <Link to={`/invoices/${tx.invoice_id}`} className="font-medium text-brand-600 hover:underline">{tx.invoice_number}</Link>
          <span className="ml-2 text-xs capitalize text-slate-500">({tx.invoice_status})</span>
        </Row>
        <Row label="Customer">{tx.customer_name}</Row>
        <Row label="Payer">{tx.payer_name || tx.payer_email ? [tx.payer_name, tx.payer_email].filter(Boolean).join(' · ') : null}</Row>
        <Row label="Started">{formatDateTime(tx.created_at)}</Row>
        <Row label="Captured">{tx.captured_at ? formatDateTime(tx.captured_at) : null}</Row>
        <Row label="Verified by">{tx.verified_via ? VERIFIED_VIA[tx.verified_via] ?? tx.verified_via : null}</Row>
        <Row label="PayPal order">{<span className="font-mono text-xs">{tx.provider_order_id}</span>}</Row>
        <Row label="PayPal capture">{tx.provider_capture_id ? <span className="font-mono text-xs">{tx.provider_capture_id}</span> : null}</Row>
        {tx.status_detail && <Row label="Detail">{tx.status_detail}</Row>}
      </dl>
      <div>
        <h3 className="mb-2 font-semibold text-slate-900">Timeline</h3>
        {tx.events.length === 0 ? (
          <p className="text-slate-500">No events recorded.</p>
        ) : (
          <ol className="space-y-2">
            {tx.events.map((e) => (
              <li key={e.id} className="border-l-2 border-slate-200 pl-3">
                <p className="text-slate-900">{EVENT_LABELS[e.event_type] ?? e.event_type}{e.message && e.message !== EVENT_LABELS[e.event_type] ? ` — ${e.message}` : ''}</p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(e.occurred_at)} · {SOURCES[e.source] ?? e.source}
                  {e.amount && ` · ${formatMoney(e.amount, e.currency)}`}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
