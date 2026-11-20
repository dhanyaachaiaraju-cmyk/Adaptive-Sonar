/*
 * Currency labels from the browser's Intl data, so names and symbols are
 * correct for every ISO 4217 code the backend allows (the server is the source
 * of truth for which codes are allowed and which PayPal can process).
 */

const nameCache = new Map()

function displayNames() {
  try {
    return new Intl.DisplayNames(undefined, { type: 'currency' })
  } catch {
    return null
  }
}

export function currencyName(code) {
  if (!nameCache.has(code)) nameCache.set(code, displayNames()?.of(code) ?? code)
  return nameCache.get(code)
}

/** The local symbol, e.g. INR -> "₹", USD -> "$", CHF -> "CHF". */
export function currencySymbol(code) {
  try {
    const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0)
    return parts.find((p) => p.type === 'currency')?.value ?? code
  } catch {
    return code
  }
}

/** "INR – Indian Rupee (₹)"; the symbol is omitted when it is just the code. */
export function currencyLabel(code) {
  const symbol = currencySymbol(code)
  const name = currencyName(code)
  return `${code} – ${name}${symbol && symbol !== code ? ` (${symbol})` : ''}`
}
