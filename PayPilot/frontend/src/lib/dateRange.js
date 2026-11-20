// Date-range presets and validation for tracker filters.
// All values are ISO dates (YYYY-MM-DD). The server applies the business timezone.

export const MAX_RANGE_DAYS = 3660 // must match the backend limit

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseISO(value) {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  // Reject impossible dates such as 2026-02-30 (Date would roll them over).
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return date
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000)
}

export const PRESETS = [
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'year', label: 'This year' },
  { key: '12m', label: 'Last 12 months' },
  { key: 'custom', label: 'Custom range' },
]

/** Resolve a preset to { from, to } relative to `today` (a Date). */
export function presetRange(key, today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const minus = (days) => new Date(t.getFullYear(), t.getMonth(), t.getDate() - days)
  switch (key) {
    case 'month':
      return { from: toISO(new Date(t.getFullYear(), t.getMonth(), 1)), to: toISO(t) }
    case 'last_month':
      return {
        from: toISO(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
        to: toISO(new Date(t.getFullYear(), t.getMonth(), 0)),
      }
    case '30d':
      return { from: toISO(minus(29)), to: toISO(t) }
    case '90d':
      return { from: toISO(minus(89)), to: toISO(t) }
    case 'quarter':
      return { from: toISO(new Date(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3, 1)), to: toISO(t) }
    case 'year':
      return { from: toISO(new Date(t.getFullYear(), 0, 1)), to: toISO(t) }
    case '12m':
      return { from: toISO(new Date(t.getFullYear() - 1, t.getMonth(), t.getDate() + 1)), to: toISO(t) }
    default:
      return null
  }
}

/** Returns an error message, or null when the range is valid. */
export function validateDateRange(from, to, today = new Date()) {
  if (!from || !to) return 'Choose both a start and an end date.'
  const a = parseISO(from)
  const b = parseISO(to)
  if (!a) return 'The start date is not a valid date.'
  if (!b) return 'The end date is not a valid date.'
  if (a > b) return 'The start date must be on or before the end date.'
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (b > t) return 'The end date cannot be in the future.'
  if (daysBetween(a, b) > MAX_RANGE_DAYS) return 'The date range can be at most 10 years.'
  return null
}

/** Read a range from URL search params, falling back to a preset. Never returns an invalid range. */
export function rangeFromParams(params, fallback = 'month', today = new Date()) {
  const preset = params.get('range') || fallback
  if (preset === 'custom') {
    const from = params.get('from')
    const to = params.get('to')
    if (!validateDateRange(from, to, today)) return { preset, from, to }
  }
  const known = PRESETS.some((p) => p.key === preset && p.key !== 'custom') ? preset : fallback
  return { preset: known, ...presetRange(known, today) }
}
