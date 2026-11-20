import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/apiClient'
import { useApi } from '../hooks/useApi'
import { useDateRangeParam } from '../hooks/useDateRangeParam'
import { formatDate, formatDateTime, formatMoney } from '../lib/format'
import { Card, EmptyState, ErrorBanner, Modal, PageHeader, StatusBadge } from '../components/ui'
import DateRangeFilter from '../components/DateRangeFilter'
import Spinner from '../components/Spinner'
import TransactionsTable from '../features/payments/TransactionsTable'
import TransactionDetail from '../features/payments/TransactionDetail'
import InsightsSection from '../features/insights/InsightsSection'

const STATUS_ROWS = [
  { key: 'pending', label: 'Pending', hint: 'Issued, not yet due' },
  { key: 'overdue', label: 'Overdue', hint: 'Past due and unpaid' },
  { key: 'paid', label: 'Completed', hint: 'Paid and verified with PayPal', badge: 'paid' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'refunded', label: 'Refunded' },
  { key: 'draft', label: 'Draft', hint: 'Not yet approved' },
]

function StatTile({ label, value, detail }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  )
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export default function DashboardPage() {
  const [range, setRange] = useDateRangeParam('month')
  const query = `date_from=${range.from}&date_to=${range.to}`
  const { data, error, loading } = useApi(
    (signal) =>
      Promise.all([
        api.get(`/v1/tracker/summary?${query}`, { signal }),
        api.get(`/v1/tracker/transactions?${query}&limit=8`, { signal }),
      ]),
    [query],
  )
  const [selected, setSelected] = useState(null)
  const [summary, recent] = data ?? []

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description={
          summary
            ? `${formatDate(summary.period.date_from)} – ${formatDate(summary.period.date_to)} · times in ${summary.period.timezone}`
            : 'Collections and outstanding balances from your records.'
        }
        actions={<DateRangeFilter key={`${range.preset}-${range.from}-${range.to}`} value={range} onChange={setRange} />}
      />

      <ErrorBanner error={error} />
      {loading && !data && <Spinner label="Loading figures" />}

      {summary && (
        <>
          <section aria-labelledby="money-heading" className="space-y-4">
            <h2 id="money-heading" className="sr-only">Money by currency</h2>
            {summary.currencies.length === 0 ? (
              <Card>
                <EmptyState
                  title="No invoices or payments yet"
                  description="Figures appear here as soon as you issue invoices and customers pay them."
                  action={<Link to="/invoices/new" className="text-sm font-medium text-brand-600 hover:underline">Create an invoice</Link>}
                />
              </Card>
            ) : (
              summary.currencies.map((cur) => {
                const c = summary.collected.find((r) => r.currency === cur)
                const o = summary.outstanding.find((r) => r.currency === cur)
                return (
                  <div key={cur}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{cur}</h3>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <StatTile
                        label="Collected (net) in period"
                        value={formatMoney(c?.net ?? '0', cur)}
                        detail={
                          c
                            ? `${plural(c.payment_count, 'payment')}${Number(c.refunded) > 0 ? ` · ${formatMoney(c.refunded, cur)} refunded` : ''}`
                            : 'No payments captured in this period'
                        }
                      />
                      <StatTile
                        label="Outstanding today"
                        value={formatMoney(o?.amount ?? '0', cur)}
                        detail={o ? plural(o.invoice_count, 'open invoice') : 'Nothing awaiting payment'}
                      />
                      <StatTile
                        label="Overdue today"
                        value={formatMoney(o?.overdue_amount ?? '0', cur)}
                        detail={o?.overdue_count ? plural(o.overdue_count, 'overdue invoice') : 'Nothing overdue'}
                      />
                    </div>
                  </div>
                )
              })
            )}
            <p className="text-xs text-slate-500">
              Collected counts PayPal payments captured in the selected period, minus full refunds in that period.
              Outstanding and overdue are balances as of {formatDate(summary.period.today)}. Currencies are never combined.
            </p>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Invoices issued in period</h2>
              </div>
              {summary.invoice_status.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">No invoices were issued in this period.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Currency</th>
                      <th className="px-4 py-2 text-right font-medium">Invoices</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {STATUS_ROWS.flatMap((s) =>
                      summary.invoice_status
                        .filter((r) => r.status === s.key)
                        .map((r) => (
                          <tr key={`${r.status}-${r.currency}`}>
                            <td className="px-4 py-2">
                              <Link to={`/invoices?status=${s.key}`} title={s.hint} className="hover:opacity-80">
                                <StatusBadge status={s.badge ?? s.key} label={s.label} />
                              </Link>
                            </td>
                            <td className="px-4 py-2 text-slate-600">{r.currency}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{r.count}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.amount, r.currency)}</td>
                          </tr>
                        )),
                    )}
                  </tbody>
                </table>
              )}
            </Card>

            <Card>
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Overdue by age (today)</h2>
              </div>
              {summary.aging.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">No overdue invoices.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Days overdue</th>
                      <th className="px-4 py-2 font-medium">Currency</th>
                      <th className="px-4 py-2 text-right font-medium">Invoices</th>
                      <th className="px-4 py-2 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.aging.map((r) => (
                      <tr key={`${r.bucket}-${r.currency}`}>
                        <td className="px-4 py-2">{r.bucket}</td>
                        <td className="px-4 py-2 text-slate-600">{r.currency}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{r.count}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.amount, r.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {summary.aging.length > 0 && (
                <div className="border-t border-slate-100 px-4 py-2">
                  <Link to="/invoices?status=overdue" className="text-xs font-medium text-brand-600 hover:underline">View overdue invoices →</Link>
                </div>
              )}
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Recent transactions</h2>
              <Link to={`/payments?range=${range.preset}${range.preset === 'custom' ? `&from=${range.from}&to=${range.to}` : ''}`} className="text-xs font-medium text-brand-600 hover:underline">
                All transactions →
              </Link>
            </div>
            {recent.items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No payment activity in this period.</p>
            ) : (
              <TransactionsTable items={recent.items} onSelect={(t) => setSelected(t.id)} compact />
            )}
          </Card>

          <InsightsSection range={range} />

          <p className="text-right text-xs text-slate-400">Figures generated {formatDateTime(summary.generated_at)}</p>
        </>
      )}

      <Modal open={selected !== null} title="Transaction details" onClose={() => setSelected(null)} size="lg">
        {selected && <TransactionDetail paymentId={selected} />}
      </Modal>
    </div>
  )
}
