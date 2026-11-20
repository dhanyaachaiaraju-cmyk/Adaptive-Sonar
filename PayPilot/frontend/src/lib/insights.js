// Pure helpers for the Business Insights UI. All figures come from the API as
// decimal strings; these helpers only format and lay them out - they never
// compute financial figures.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-03" -> "Mar 2026" (or "Mar" when short). */
export function formatMonth(ym, { short = false } = {}) {
  const [y, m] = String(ym).split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return String(ym)
  return short ? MONTHS[m - 1] : `${MONTHS[m - 1]} ${y}`
}

/**
 * A "nice" axis for a bar chart: rounds the extent up to 1/2/2.5/5 x 10^n and
 * returns evenly spaced ticks. Supports negative minimums (net refunds).
 */
export function niceScale(minValue, maxValue, tickCount = 4) {
  const lo = Math.min(0, Number(minValue) || 0)
  const hi = Math.max(0, Number(maxValue) || 0)
  if (lo === 0 && hi === 0) return { min: 0, max: 1, ticks: [0, 1] }
  const span = hi - lo
  const raw = span / tickCount
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => s >= raw)
  const min = Math.floor(lo / step) * step
  const max = Math.ceil(hi / step) * step
  const ticks = []
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(10)))
  return { min, max, ticks }
}

/**
 * Describe a change between periods as returned by the API.
 * `change` and `pct` are decimal strings (pct may be null when there is no baseline).
 */
export function describeChange(change, pct, { upIsGood = true } = {}) {
  const value = Number(change)
  if (pct === null || pct === undefined) {
    return { direction: value === 0 ? 'flat' : 'none', tone: 'neutral', pctLabel: 'no previous data' }
  }
  const p = Number(pct)
  if (value === 0 || p === 0) return { direction: 'flat', tone: 'neutral', pctLabel: '0.0%' }
  const direction = value > 0 ? 'up' : 'down'
  const good = direction === 'up' ? upIsGood : !upIsGood
  return { direction, tone: good ? 'good' : 'bad', pctLabel: `${p > 0 ? '+' : ''}${pct}%` }
}

/** Clamp a percentage string to a 0-100 meter width. */
export function meterWidth(pct) {
  const n = Number(pct)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

/** Series for one currency, as [{ month, value, ...point }], from the API monthly block. */
export function seriesFor(monthly, currency) {
  const s = monthly?.series?.find((x) => x.currency === currency)
  return s ? s.points.map((p) => ({ ...p, value: Number(p.collected_net) })) : []
}
