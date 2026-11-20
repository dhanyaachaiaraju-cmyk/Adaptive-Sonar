import { getCountryCallingCode, parsePhoneNumberFromString, validatePhoneNumberLength } from 'libphonenumber-js/max'

/*
 * Phone validation with libphonenumber-js (a maintained port of Google's
 * libphonenumber, full "max" metadata so number ranges are checked, not just
 * lengths). The backend re-validates with Python `phonenumbers`.
 *
 * This checks the FORMAT only. It does not prove the customer owns the number.
 */

const LENGTH_MESSAGES = {
  TOO_SHORT: 'This number is too short for the selected country.',
  TOO_LONG: 'This number is too long for the selected country.',
  INVALID_LENGTH: 'This number has the wrong number of digits for the selected country.',
  INVALID_COUNTRY: 'Select a calling code.',
  NOT_A_NUMBER: 'Enter digits only.',
}

/**
 * Combine a calling-code country and a national number.
 * Returns { e164: '+919876543210' | null, error: string | null }. Empty input -> both null.
 */
export function toE164(country, national) {
  const raw = String(national ?? '').trim()
  if (!raw) return { e164: null, error: null }
  if (!country) return { e164: null, error: 'Select a calling code.' }
  if (/[^\d\s().+-]/.test(raw)) return { e164: null, error: 'Use digits only (spaces, dashes and brackets are fine).' }
  // A pasted "+44 ..." number is parsed on its own; otherwise use the selected calling code.
  const parsed = parsePhoneNumberFromString(raw, raw.startsWith('+') ? undefined : country)
  const lengthIssue = validatePhoneNumberLength(raw, raw.startsWith('+') ? undefined : country)
  if (lengthIssue) return { e164: null, error: LENGTH_MESSAGES[lengthIssue] ?? 'This is not a valid phone number.' }
  if (!parsed) return { e164: null, error: 'This is not a valid phone number.' }
  if (!parsed.isValid()) return { e164: null, error: 'This number is not valid for the selected country.' }
  return { e164: parsed.number, error: null }
}

/**
 * Split a stored E.164 number for editing: { country: 'IN', national: '9876543210' }.
 * The national part has no trunk prefix (no leading 0), since the calling code is shown separately.
 */
export function splitE164(e164, fallbackCountry) {
  if (!e164) return { country: fallbackCountry ?? null, national: '' }
  const parsed = parsePhoneNumberFromString(e164)
  if (!parsed) return { country: fallbackCountry ?? null, national: e164 }
  return { country: parsed.country ?? fallbackCountry ?? null, national: parsed.nationalNumber }
}

export function callingCode(country) {
  try {
    return country ? `+${getCountryCallingCode(country)}` : ''
  } catch {
    return ''
  }
}

/** Display form, e.g. "+91 98765 43210". */
export function formatPhone(e164) {
  const parsed = e164 ? parsePhoneNumberFromString(e164) : null
  return parsed ? parsed.formatInternational() : e164 || ''
}
