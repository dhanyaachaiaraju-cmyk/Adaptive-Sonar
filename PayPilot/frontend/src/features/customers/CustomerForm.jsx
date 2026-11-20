import { useRef, useState } from 'react'
import { api } from '../../lib/apiClient'
import { notifyCustomersChanged } from '../../lib/customerList'
import { filterPostalInput, postalCodeError, postalFormat, postalHint } from '../../lib/countries'
import { toE164 } from '../../lib/phone'
import { Button, ErrorBanner, Field, Input, Textarea } from '../../components/ui'
import CountrySelect from '../../components/CountrySelect'
import PhoneInput from '../../components/PhoneInput'
import { serverFieldErrors, toCustomerForm, toCustomerPayload, validateCustomer } from './customerPayload'

export default function CustomerForm({ customer, onSaved, onCancel }) {
  const [form, setForm] = useState(() => toCustomerForm(customer))
  const [phoneCodeTouched, setPhoneCodeTouched] = useState(Boolean(customer?.phone))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const savingRef = useRef(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const clearError = (key) => setErrors((x) => (x[key] ? { ...x, [key]: undefined } : x))

  function setCountry(code) {
    setForm((f) => ({
      ...f,
      country_code: code,
      // The calling code follows the country until the user picks one themselves.
      phone_country: phoneCodeTouched ? f.phone_country : code,
      postal_code: filterPostalInput(code, f.postal_code),
    }))
    clearError('postal_code')
  }

  async function submit(e) {
    e.preventDefault()
    // The dialog is portalled out of the invoice <form> in the DOM, but React
    // still bubbles synthetic events through the component tree - so stop this
    // submit from also triggering the invoice form's "Save draft".
    e.stopPropagation()
    // One request per save, even on a fast double-click / double Enter.
    if (savingRef.current) return
    const { errors: found, phone } = validateCustomer(form)
    setErrors(found)
    if (Object.values(found).some(Boolean)) return
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const payload = toCustomerPayload(form, phone)
      const saved = customer
        ? await api.patch(`/v1/customers/${customer.id}`, payload)
        : await api.post('/v1/customers', payload)
      notifyCustomersChanged(saved)
      onSaved(saved)
    } catch (err) {
      const fieldErrors = serverFieldErrors(err)
      setErrors(fieldErrors)
      setError(Object.keys(fieldErrors).length ? 'Please correct the highlighted fields.' : err)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const numericPostal = postalFormat(form.country_code)?.numeric

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <ErrorBanner error={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name *" error={errors.name}>
          {(id) => <Input id={id} required maxLength={200} value={form.name} onChange={set('name')} aria-invalid={errors.name ? true : undefined} />}
        </Field>
        <Field label="Company">{(id) => <Input id={id} maxLength={200} value={form.company_name} onChange={set('company_name')} />}</Field>
        <Field label="Email" hint="Required before an invoice can be issued" error={errors.email}>
          {(id) => (
            <Input id={id} type="email" autoComplete="email" maxLength={254} value={form.email} onChange={set('email')} aria-invalid={errors.email ? true : undefined} />
          )}
        </Field>
        <PhoneInput
          country={form.phone_country || null}
          national={form.phone_national}
          onCountryChange={(code) => {
            setPhoneCodeTouched(true)
            setForm((f) => ({ ...f, phone_country: code }))
            clearError('phone')
          }}
          onNationalChange={(v) => {
            setForm((f) => ({ ...f, phone_national: v }))
            clearError('phone')
          }}
          onBlur={() => setErrors((x) => ({ ...x, phone: toE164(form.phone_country, form.phone_national).error ?? undefined }))}
          error={errors.phone}
        />
        <Field label="Country" className="sm:col-span-2" hint="Search by name or calling code, e.g. India or +91">
          {(id) => <CountrySelect id={id} value={form.country_code || null} onChange={setCountry} />}
        </Field>
        <Field label="Address line 1" className="sm:col-span-2">
          {(id) => <Input id={id} maxLength={200} autoComplete="address-line1" value={form.address_line1} onChange={set('address_line1')} />}
        </Field>
        <Field label="Address line 2" className="sm:col-span-2">
          {(id) => <Input id={id} maxLength={200} autoComplete="address-line2" value={form.address_line2} onChange={set('address_line2')} />}
        </Field>
        <Field label="City">{(id) => <Input id={id} maxLength={100} autoComplete="address-level2" value={form.city} onChange={set('city')} />}</Field>
        <Field label="State / region">{(id) => <Input id={id} maxLength={100} autoComplete="address-level1" value={form.state} onChange={set('state')} />}</Field>
        <Field label="Postal / ZIP code" hint={postalHint(form.country_code)} error={errors.postal_code}>
          {(id) => (
            <Input
              id={id}
              maxLength={20}
              autoComplete="postal-code"
              inputMode={numericPostal ? 'numeric' : 'text'}
              value={form.postal_code}
              onChange={(e) => {
                setForm((f) => ({ ...f, postal_code: filterPostalInput(f.country_code, e.target.value) }))
                clearError('postal_code')
              }}
              onBlur={() => setErrors((x) => ({ ...x, postal_code: postalCodeError(form.country_code, form.postal_code) ?? undefined }))}
              aria-invalid={errors.postal_code ? true : undefined}
              className={numericPostal ? '' : 'uppercase'}
            />
          )}
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          {(id) => <Textarea id={id} maxLength={5000} value={form.notes} onChange={set('notes')} />}
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : customer ? 'Save changes' : 'Add customer'}</Button>
      </div>
    </form>
  )
}
