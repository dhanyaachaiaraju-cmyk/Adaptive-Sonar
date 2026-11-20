import { normalizePostalCode, postalCodeError } from '../../lib/countries'
import { splitE164, toE164 } from '../../lib/phone'

export const TEXT_FIELDS = ['name', 'email', 'company_name', 'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'notes']
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function toCustomerForm(customer) {
  const form = Object.fromEntries(TEXT_FIELDS.map((f) => [f, customer?.[f] ?? '']))
  const country = customer?.country_code ?? ''
  const phone = splitE164(customer?.phone, customer?.phone_country ?? (country || null))
  return { ...form, country_code: country, phone_country: phone.country ?? '', phone_national: phone.national }
}

/** Client-side checks. The server re-validates everything; these only give faster feedback. */
export function validateCustomer(form) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'Name is required.'
  if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) errors.email = 'Enter a valid email address.'
  const phone = toE164(form.phone_country, form.phone_national)
  if (phone.error) errors.phone = phone.error
  const postal = postalCodeError(form.country_code, form.postal_code)
  if (postal) errors.postal_code = postal
  return { errors, phone: phone.e164 }
}

export function toCustomerPayload(form, phoneE164) {
  const out = {}
  for (const f of TEXT_FIELDS) {
    const v = typeof form[f] === 'string' ? form[f].trim() : form[f]
    out[f] = v === '' ? null : v
  }
  if (out.postal_code) out.postal_code = normalizePostalCode(out.postal_code)
  out.country_code = form.country_code || null
  out.phone = phoneE164
  return out
}

/** Map a 422 response's field details onto form fields. */
export function serverFieldErrors(err) {
  const details = Array.isArray(err?.details) ? err.details : []
  const out = {}
  for (const d of details) {
    const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : null
    if (typeof field === 'string' && !out[field]) out[field] = String(d.msg || 'Invalid value').replace(/^Value error, /, '')
  }
  return out
}
