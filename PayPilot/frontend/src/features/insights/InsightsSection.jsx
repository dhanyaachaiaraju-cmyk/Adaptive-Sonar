import { api } from '../../lib/apiClient'
import { useApi } from '../../hooks/useApi'
import { formatDate, formatMoney } from '../../lib/format'
import { describeChange, meterWidth, seriesFor } from '../../lib/insights'
import { Card, ErrorBanner } from '../../components/ui'
import Spinner from '../../components/Spinner'
import MonthlyBarChart from '../../components/charts/MonthlyBarChart'

const DEFINITION_LABELS = {
  collected_net: 'Collected (net)',
  outstanding: 'Outstanding',
  overdue: 'Overdue',
  invoiced: 'Invoiced',
  month_comparison: 'Month comparison',
  days_to_pay: 'Days to pay',
  on_time_rate: 'On-time payment rate',
  paid_invoice_total: 'Paid invoice total',
  sample_size: 'Sample size',
}

const TONE = { good: 'text-emerald-700', bad: 'text-red-700', neutral: 'text-slate-500' }
const ARROW = { up: '▲', down: '▼', flat: '■', none: '' }

function Tile({ label, children, footer }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <div className="mt-1">{children}</div>
      {footer && <p className="mt-1 text-xs text-slate-500">{footer}</p>}
    </div>
  )
}

function ComparisonTile({ label, current, previous, change, pct, currency, previousWindow }) {
  const d = describeChange(change, pct)
  return (
    <Tile label={label} footer={`vs ${formatMoney(previous, currency)} for ${formatDate(previousWindow.date_from)} – ${formatDate(previousWindow.date_to)}`}>
      <p className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{formatMoney(current, currency)}</p>
      <p className={`mt-0.5 text-xs font-medium ${TONE[d.tone]}`}>
        {ARROW[d.direction]} {d.direction === 'none' ? '' : `${Number(change) > 0 ? '+' : ''}${formatMoney(change, currency)} `}({d.pctLabel})
      </p>
    </Tile>
  )
}

function NotEnough({ children }) {
  return (
    <>
      <p className="text-lg font-semibold text-slate-400">Not enough data</p>
      <p className="mt-0.5 text-xs text-slate-500">{children}</p>
    </>
  )
}

function CurrencyInsights({ data, currency }) {
  const comparison = data.month_comparison.rows.find((r) => r.currency === currency)
  const behaviour = data.payment_behaviour.find((r) => r.currency === currency)
  const customers = data.customers.filter((c) => c.currency === currency)
  const points = seriesFor(data.monthly, currency)
  const mc = data.month_comparison

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{currency}</h3>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {comparison ? (
          <>
            <ComparisonTile
              label={`Collected, ${formatDate(mc.current.date_from)} – ${formatDate(mc.current.date_to)}`}
              current={comparison.current_collected}
              previous={comparison.previous_collected}
              change={comparison.collected_change}
              pct={comparison.collected_change_pct}
              currency={currency}
              previousWindow={mc.previous}
            />
            <ComparisonTile
              label={`Invoiced, ${formatDate(mc.current.date_from)} – ${formatDate(mc.current.date_to)}`}
              current={comparison.current_invoiced}
              previous={comparison.previous_invoiced}
              change={comparison.invoiced_change}
              pct={comparison.invoiced_change_pct}
              currency={currency}
              previousWindow={mc.previous}
            />
          </>
        ) : (
          <Tile label="Month comparison"><NotEnough>No collections or invoices in either comparison window.</NotEnough></Tile>
        )}

        <Tile
          label="Average days to pay"
          footer={behaviour?.sufficient_data ? `Median ${behaviour.median_days_to_pay} days · ${behaviour.paid_invoices} paid invoices` : null}
        >
          {!behaviour ? (
            <NotEnough>No invoices were paid in this period.</NotEnough>
          ) : !behaviour.sufficient_data ? (
            <NotEnough>{behaviour.note}</NotEnough>
          ) : (
            <p className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{behaviour.avg_days_to_pay} days</p>
          )}
        </Tile>

        <Tile
          label="On-time payment rate"
          footer={behaviour?.sufficient_data ? `${behaviour.on_time_count} of ${behaviour.paid_invoices} paid by the due date` : null}
        >
          {!behaviour ? (
            <NotEnough>No invoices were paid in this period.</NotEnough>
          ) : !behaviour.sufficient_data ? (
            <NotEnough>{behaviour.note}</NotEnough>
          ) : (
            <>
              <p className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{behaviour.on_time_rate}%</p>
              <div
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-brand-100"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Number(behaviour.on_time_rate)}
                aria-label="On-time payment rate"
              >
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${meterWidth(behaviour.on_time_rate)}%` }} />
              </div>
            </>
          )}
        </Tile>
      </div>

      {points.length > 0 && <MonthlyBarChart title={`Net collections by month (${currency})`} points={points} currency={currency} />}

      <Card>
        <div className="border-b border-slate-100 px-4 py-3">
          <h4 className="text-sm font-semibold text-slate-900">Customer payment patterns ({currency})</h4>
          <p className="text-xs text-slate-500">Top customers by invoices paid in the period, then by outstanding balance.</p>
        </div>
        {customers.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">No customer paid or owes an invoice in {currency} for this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Customer</th>
                  <th className="px-4 py-2 text-right font-medium">Paid</th>
                  <th className="px-4 py-2 text-right font-medium">Paid total</th>
                  <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Avg days</th>
                  <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">On time</th>
                  <th className="px-4 py-2 text-right font-medium">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((c) => (
                  <tr key={c.customer_id}>
                    <td className="px-4 py-2">
                      {c.customer_name}
                      {c.overdue_invoices > 0 && <span className="ml-2 text-xs text-red-700">{c.overdue_invoices} overdue</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.paid_invoices}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(c.paid_invoice_total, currency)}</td>
                    <td className="hidden px-4 py-2 text-right tabular-nums sm:table-cell">{c.avg_days_to_pay ?? '—'}</td>
                    <td className="hidden px-4 py-2 text-right tabular-nums sm:table-cell">
                      {c.on_time_rate !== null ? `${c.on_time_rate}%` : '—'}
                      {c.paid_invoices > 0 && !c.sufficient_data && (
                        <span className="ml-1 text-[10px] text-slate-400" title={`Based on fewer than ${data.min_sample} paid invoices`}>limited data</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatMoney(c.outstanding, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

/** Business Insights for the dashboard's selected date range. */
export default function InsightsSection({ range }) {
  const query = `date_from=${range.from}&date_to=${range.to}`
  const { data, error, loading } = useApi((signal) => api.get(`/v1/insights?${query}`, { signal }), [query])

  return (
    <section aria-labelledby="insights-heading" className="space-y-4">
      <div>
        <h2 id="insights-heading" className="text-lg font-semibold tracking-tight text-slate-900">Business insights</h2>
        <p className="text-sm text-slate-500">
          {data
            ? `${formatDate(data.period.date_from)} – ${formatDate(data.period.date_to)} · calculated from your records, per currency`
            : 'Trends and payment behaviour calculated from your records.'}
        </p>
      </div>

      <ErrorBanner error={error} />
      {loading && !data && <Spinner label="Calculating insights" />}

      {data && (
        <>
          {data.notes.length > 0 && (
            <ul className="space-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {data.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
          {data.currencies.map((cur) => <CurrencyInsights key={cur} data={data} currency={cur} />)}
          <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
            <summary className="cursor-pointer font-medium text-slate-900">How these figures are calculated</summary>
            <dl className="mt-3 space-y-2">
              <div>
                <dt className="font-medium text-slate-700">Period</dt>
                <dd className="text-slate-600">
                  {formatDate(data.period.date_from)} – {formatDate(data.period.date_to)}, in your business timezone ({data.period.timezone}).
                  Currencies are never combined.
                </dd>
              </div>
              {Object.entries(data.definitions).map(([key, text]) => (
                <div key={key}>
                  <dt className="font-medium text-slate-700">{DEFINITION_LABELS[key] ?? key}</dt>
                  <dd className="text-slate-600">{text}</dd>
                </div>
              ))}
            </dl>
          </details>
        </>
      )}
    </section>
  )
}
