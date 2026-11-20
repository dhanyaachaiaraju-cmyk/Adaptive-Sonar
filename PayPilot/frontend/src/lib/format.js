const moneyFormatters = new Map()

/** Format a decimal string from the API (e.g. "1385.97") in its currency. */
export function formatMoney(amount, currency = 'USD') {
  if (amount === null || amount === undefined || amount === '') return '—'
  const key = currency || 'USD'
  if (!moneyFormatters.has(key)) {
    moneyFormatters.set(key, new Intl.NumberFormat(undefined, { style: 'currency', currency: key }))
  }
  return moneyFormatters.get(key).format(Number(amount))
}

export function formatDate(value) {
  if (!value) return '—'
  // Date-only strings ("2026-11-12") must not be shifted by the local timezone.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + Number(days || 0))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Client-side estimate for the editor preview only. The server recomputes and
 * stores the authoritative totals on save (integer cents to avoid float drift).
 */
export function estimateTotals(items, taxRate) {
  const toCents = (n) => Math.round(Number(n || 0) * 100)
  const subtotalCents = items.reduce((sum, it) => sum + Math.round(Number(it.quantity || 0) * toCents(it.unit_price)), 0)
  const taxCents = Math.round((subtotalCents * Number(taxRate || 0)) / 100)
  return {
    subtotal: (subtotalCents / 100).toFixed(2),
    tax: (taxCents / 100).toFixed(2),
    total: ((subtotalCents + taxCents) / 100).toFixed(2),
  }
}
