import { Link } from 'react-router-dom'
import { formatDateTime, formatMoney } from '../../lib/format'
import { paymentStatusInfo } from '../../lib/paymentStatus'
import { StatusBadge } from '../../components/ui'

export default function TransactionsTable({ items, onSelect, compact = false }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Invoice</th>
            <th className={`px-4 py-3 font-medium ${compact ? 'hidden md:table-cell' : ''}`}>Customer</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((t) => {
            const info = paymentStatusInfo(t.status)
            return (
              <tr
                key={t.id}
                tabIndex={0}
                onClick={() => onSelect?.(t)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect?.(t))}
                className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                aria-label={`${info.label} payment of ${formatMoney(t.amount, t.currency)} for ${t.invoice_number}`}
              >
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(t.activity_at)}</td>
                <td className="px-4 py-3">
                  <Link to={`/invoices/${t.invoice_id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-brand-700 hover:underline">
                    {t.invoice_number}
                  </Link>
                </td>
                <td className={`px-4 py-3 ${compact ? 'hidden md:table-cell' : ''}`}>{t.customer_name}</td>
                <td className="px-4 py-3"><StatusBadge status={info.badge} label={info.label} title={info.help} /></td>
                <td className="px-4 py-3 text-right tabular-nums">{formatMoney(t.amount, t.currency)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
