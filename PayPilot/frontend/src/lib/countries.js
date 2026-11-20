import { getCountries, getCountryCallingCode } from 'libphonenumber-js/max'
import postalFormats from '../data/postal-codes.json'

/*
 * Country data comes from libphonenumber's metadata (the same source the backend's
 * `phonenumbers` package uses), names from the browser's Intl.DisplayNames, and
 * postal-code formats from src/data/postal-codes.json - an exact copy of the
 * backend's file, enforced by a backend test.
 */

const fold = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

let cache = null

/** [{ code: 'IN', name: 'India', callingCode: '91' }, ...] sorted by name. */
export function countryList(locale) {
  if (cache && cache.locale === (locale ?? 'default')) return cache.list
  let names
  try {
    names = new Intl.DisplayNames(locale ? [locale] : undefined, { type: 'region' })
  } catch {
    names = null
  }
  const list = getCountries()
    .map((code) => ({ code, name: names?.of(code) ?? code, callingCode: getCountryCallingCode(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale))
  cache = { locale: locale ?? 'default', list }
  return list
}

export function findCountry(code) {
  return code ? countryList().find((c) => c.code === code) ?? null : null
}

/**
 * Search by country name, ISO code or calling code. "india", "IN", "+91" and
 * "91" all find India. Best matches first: exact ISO/calling code, then names
 * starting with the query, then names containing it, then partial calling codes.
 */
export function searchCountries(query, list = countryList()) {
  const q = fold(query)
  if (!q) return list
  const digits = q.replace(/^\+/, '')
  const isDialQuery = /^\+?\d+$/.test(q)
  const scored = []
  for (const c of list) {
    const name = fold(c.name)
    let score = -1
    if (isDialQuery) {
      if (c.callingCode === digits) score = 0
      else if (c.callingCode.startsWith(digits)) score = 3
    } else if (q.length === 2 && c.code.toLowerCase() === q) score = 0
    else if (name.startsWith(q)) score = 1
    else if (name.split(/[\s(),-]+/).some((w) => w.startsWith(q))) score = 2
    else if (name.includes(q)) score = 4
    if (score >= 0) scored.push([score, c])
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).map(([, c]) => c)
}

// ---------------------------------------------------------------------------
// Postal codes (mirrors backend app/core/contact.py)
// ---------------------------------------------------------------------------
const GENERIC_POSTAL = /^[A-Z0-9](?:[A-Z0-9 -]{0,18}[A-Z0-9])?$/

export function postalFormat(country) {
  const fmt = country ? postalFormats[country] : null
  return fmt && typeof fmt === 'object' ? fmt : null
}

export function normalizePostalCode(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
}

/** Restrict keystrokes for numeric-only countries; leave alphanumeric countries alone. */
export function filterPostalInput(country, value) {
  const fmt = postalFormat(country)
  return fmt?.numeric ? String(value).replace(/[^\d -]/g, '') : value
}

/** Returns an error message, or null when the value is acceptable (empty is acceptable). */
export function postalCodeError(country, value) {
  const code = normalizePostalCode(value)
  if (!code) return null
  const fmt = postalFormat(country)
  if (fmt?.pattern) {
    // JSON patterns are Python-style; they use only syntax JS regexes share.
    if (!new RegExp(fmt.pattern).test(code)) {
      return `Not a valid postal code for ${findCountry(country)?.name ?? country} (${fmt.numeric ? 'digits' : 'letters and digits'}, e.g. ${fmt.example}).`
    }
    return null
  }
  return GENERIC_POSTAL.test(code) ? null : 'Postal code may only contain letters, digits, spaces and hyphens.'
}

export function postalHint(country) {
  const fmt = postalFormat(country)
  if (!country) return 'Select a country first for format checking'
  if (fmt?.none) return `${findCountry(country)?.name ?? country} does not use postal codes - leave blank`
  if (fmt?.pattern) return `e.g. ${fmt.example}${fmt.numeric ? ' (digits only)' : ''}`
  return 'Letters, digits, spaces and hyphens'
}
