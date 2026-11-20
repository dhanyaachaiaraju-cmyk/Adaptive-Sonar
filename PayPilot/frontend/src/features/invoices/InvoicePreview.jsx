import { formatDate, formatMoney } from '../../lib/format'
import { StatusBadge } from '../../components/ui'

/**
 * Printable invoice preview. `invoice` may be a saved invoice from the API or an
 * unsaved draft (AI proposal / editor state) - totals are shown as given.
 */
export default function InvoicePreview({ invoice, business, customer, totals, estimate = false }) {
  const cust = customer ?? invoice.customer ?? {}
  const t = totals ?? { subtotal: invoice.subtotal, tax: invoice.tax_amount, total: invoice.total }
  const currency = invoice.currency

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-6 text-sm shadow-sm sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-6">
        <div>
          <p className="text-lg font-semibold text-slate-900">{business?.business_name || 'Your business name'}</p>
          <div className="mt-1 space-y-0.5 text-slate-500">
            {business?.business_email && <p>{business.business_email}</p>}
            {business?.address_line1 && <p>{business.address_line1}</p>}
            {(business?.city || business?.postal_code) && (
              <p>{[business.city, business.state, business.postal_code].filter(Boolean).join(', ')}</p>
            )}
            {business?.tax_id && <p>Tax ID: {business.tax_id}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Invoice</p>
          <p className="text-lg font-semibold text-slate-900">{invoice.invoice_number || 'Draft'}</p>
          {invoice.display_status && <div className="mt-1"><StatusBadge status={invoice.display_status} /></div>}
        </div>
      </header>

      <section className="grid gap-6 border-b border-slate-100 py-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Bill to</p>
          <p className="mt-1 font-medium text-slate-900">{cust.name || '—'}</p>
          {cust.company_name && <p className="text-slate-600">{cust.company_name}</p>}
          {cust.email ? <p className="text-slate-600">{cust.email}</p> : <p className="text-amber-700">No email address</p>}
        </div>
        <dl className="grid grid-cols-2 gap-y-1 sm:text-right">
          <dt className="text-slate-500">Issue date</dt>
          <dd className="font-medium">{formatDate(invoice.issue_date)}</dd>
          <dt className="text-slate-500">Due date</dt>
          <dd className="font-medium">{formatDate(invoice.due_date)}</dd>
          <dt className="text-slate-500">Currency</dt>
          <dd className="font-medium">{currency}</dd>
        </dl>
      </section>

      <div className="overflow-x-auto">
        <table className="w-full py-4 text-left">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-3 font-medium">Description</th>
              <th className="py-3 text-right font-medium">Qty</th>
              <th className="py-3 text-right font-medium">Unit price</th>
              <th className="py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(invoice.items || []).map((item, i) => (
              <tr key={item.id ?? i}>
                <td className="py-3 pr-4 text-slate-900">{item.description || <span className="text-slate-400">—</span>}</td>
                <td className="py-3 text-right tabular-nums">{item.quantity}</td>
                <td className="py-3 text-right tabular-nums">{formatMoney(item.unit_price, currency)}</td>
                <td className="py-3 text-right tabular-nums">
                  {formatMoney(item.amount ?? (Number(item.quantity || 0) * Number(item.unit_price || 0)).toFixed(2), currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-4 flex justify-end border-t border-slate-100 pt-4">
        <dl className="w-full max-w-xs space-y-1">
          <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="tabular-nums">{formatMoney(t.subtotal, currency)}</dd></div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Tax ({Number(invoice.tax_rate || 0)}%)</dt>
            <dd className="tabular-nums">{formatMoney(t.tax, currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
            <dt>Total</dt><dd className="tabular-nums">{formatMoney(t.total, currency)}</dd>
          </div>
          {estimate && <p className="pt-1 text-right text-xs text-slate-400">Estimate — final totals are calculated by the server.</p>}
        </dl>
      </section>

      {invoice.notes && (
        <section className="mt-6 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-slate-600">{invoice.notes}</p>
        </section>
      )}
    </article>
  )
}
