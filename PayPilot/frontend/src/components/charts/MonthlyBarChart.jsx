import { useState } from 'react'
import { useElementWidth } from '../../hooks/useElementWidth'
import { formatMonth, niceScale } from '../../lib/insights'
import { formatMoney } from '../../lib/format'

const HEIGHT = 220
const PAD = { top: 12, right: 8, bottom: 28, left: 56 }
const BAR_COLOR = '#2554e0' // brand-600; validated: contrast >= 3:1 on the white surface
const GRID = '#e2e8f0' // slate-200, recessive
const RADIUS = 4

function compact(value, currency) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

/** Bar path with rounded corners only at the data end (top for positive, bottom for negative). */
function barPath(x, w, yZero, yValue) {
  const r = Math.min(RADIUS, w / 2, Math.abs(yZero - yValue))
  if (yValue < yZero) {
    return `M${x},${yZero} V${yValue + r} Q${x},${yValue} ${x + r},${yValue} H${x + w - r} Q${x + w},${yValue} ${x + w},${yValue + r} V${yZero} Z`
  }
  return `M${x},${yZero} V${yValue - r} Q${x},${yValue} ${x + r},${yValue} H${x + w - r} Q${x + w},${yValue} ${x + w},${yValue - r} V${yZero} Z`
}

/**
 * Single-series monthly bar chart (net collected). One hue, no legend: the
 * title names the series. Each month has a hover/focus tooltip and the same
 * data is available as a table.
 */
export default function MonthlyBarChart({ title, points, currency }) {
  const [ref, width] = useElementWidth()
  const [active, setActive] = useState(null)
  const [showTable, setShowTable] = useState(false)

  const values = points.map((p) => p.value)
  const { min, max, ticks } = niceScale(Math.min(...values, 0), Math.max(...values, 0))
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const y = (v) => PAD.top + ((max - v) / (max - min)) * plotH
  const band = plotW / Math.max(points.length, 1)
  const barW = Math.max(4, Math.min(40, band * 0.6))
  const labelEvery = Math.ceil(points.length / Math.max(1, Math.floor(plotW / 56)))
  const yZero = y(0)
  const allZero = values.every((v) => v === 0)
  const activePoint = active !== null ? points[active] : null

  return (
    <figure className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <figcaption className="text-sm font-semibold text-slate-900">{title}</figcaption>
        <button type="button" onClick={() => setShowTable((s) => !s)} className="text-xs font-medium text-brand-600 hover:underline">
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      <div ref={ref} className="relative">
      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-2 font-medium">Month</th>
                <th className="py-2 pr-2 text-right font-medium">Collected (net)</th>
                <th className="py-2 pr-2 text-right font-medium">Refunded</th>
                <th className="py-2 pr-2 text-right font-medium">Payments</th>
                <th className="py-2 text-right font-medium">Invoiced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {points.map((p) => (
                <tr key={p.month}>
                  <td className="py-1.5 pr-2">{formatMonth(p.month)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(p.collected_net, currency)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(p.refunded, currency)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{p.payment_count}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(p.invoiced, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : allZero ? (
        <p className="py-10 text-center text-sm text-slate-500">No payments were captured in this period.</p>
      ) : (
        <>
          <svg width={width} height={HEIGHT} role="img" aria-label={`${title}. Use Tab to move between months, or open the table view.`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#94a3b8' : GRID} strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[11px] tabular-nums">
                  {compact(t, currency)}
                </text>
              </g>
            ))}
            {points.map((p, i) => {
              const cx = PAD.left + band * i + band / 2
              const x = cx - barW / 2
              return (
                <g key={p.month}>
                  {p.value !== 0 && <path d={barPath(x, barW, yZero, y(p.value))} fill={BAR_COLOR} opacity={active === null || active === i ? 1 : 0.55} />}
                  {i % labelEvery === 0 && (
                    <text x={cx} y={HEIGHT - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
                      {formatMonth(p.month, { short: points.length > 6 })}
                    </text>
                  )}
                  {/* Hit target: the whole column, larger than the bar. */}
                  <rect
                    x={PAD.left + band * i}
                    y={PAD.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    role="img"
                    aria-label={`${formatMonth(p.month)}: ${formatMoney(p.collected_net, currency)} collected net`}
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="cursor-default focus:outline-none"
                  />
                </g>
              )
            })}
            {active !== null && (
              <rect x={PAD.left + band * active + 1} y={PAD.top} width={band - 2} height={plotH} fill="none" stroke="#cbd5e1" strokeDasharray="3 3" pointerEvents="none" />
            )}
          </svg>
          {activePoint && (
            <div
              role="tooltip"
              className="pointer-events-none absolute top-2 z-10 w-48 rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg"
              style={{ left: Math.min(Math.max(PAD.left + band * active + band / 2 - 96, 0), width - 192) }}
            >
              <p className="font-semibold text-slate-900">{formatMonth(activePoint.month)}</p>
              <dl className="mt-1 space-y-0.5">
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Collected (net)</dt><dd className="font-medium tabular-nums text-slate-900">{formatMoney(activePoint.collected_net, currency)}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Gross</dt><dd className="tabular-nums">{formatMoney(activePoint.collected_gross, currency)}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Refunded</dt><dd className="tabular-nums">{formatMoney(activePoint.refunded, currency)}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Payments</dt><dd className="tabular-nums">{activePoint.payment_count}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Invoiced</dt><dd className="tabular-nums">{formatMoney(activePoint.invoiced, currency)}</dd></div>
              </dl>
            </div>
          )}
        </>
      )}
      </div>
    </figure>
  )
}
