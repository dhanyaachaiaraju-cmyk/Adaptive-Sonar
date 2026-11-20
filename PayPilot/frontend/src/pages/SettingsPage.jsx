import { useState } from 'react'
import { api } from '../lib/apiClient'
import { useApi } from '../hooks/useApi'
import { currencyLabel } from '../lib/currencies'
import { Button, Card, ErrorBanner, Field, Input, PageHeader, Select, Textarea } from '../components/ui'
import Spinner from '../components/Spinner'

const TEXT_FIELDS = ['business_name', 'business_email', 'phone', 'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country_code', 'tax_id', 'invoice_footer', 'invoice_prefix', 'timezone']

export default function SettingsPage() {
  const { data, error, loading } = useApi(
    (signal) => Promise.all([api.get('/v1/settings/business', { signal }), api.get('/v1/settings/currencies', { signal })]),
    [],
  )
  if (loading && !data) return <Spinner label="Loading settings" />
  if (error) return <ErrorBanner error={error} />
  return <SettingsForm settings={data[0]} currencies={data[1]} />
}

function SettingsForm({ settings, currencies }) {
  const [form, setForm] = useState(() => ({
    ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, settings[f] ?? ''])),
    default_currency: settings.default_currency,
    default_payment_terms_days: settings.default_payment_terms_days,
    default_tax_rate: settings.default_tax_rate,
  }))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]),
      )
      // Required fields cannot be cleared.
      for (const k of ['invoice_prefix', 'timezone']) if (payload[k] === null) delete payload[k]
      payload.default_payment_terms_days = Number(form.default_payment_terms_days)
      payload.default_tax_rate = String(form.default_tax_rate || '0')
      await api.patch('/v1/settings/business', payload)
      setSaved(true)
    } catch (err) {
      setSaveError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="max-w-3xl">
      <PageHeader
        title="Business settings"
        description="Shown on your invoices and used as defaults for new invoices."
        actions={<Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>}
      />
      <ErrorBanner error={saveError} className="mb-4" />
      {saved && <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Settings saved.</p>}

      <Card className="mb-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Business details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name">{(id) => <Input id={id} maxLength={200} value={form.business_name} onChange={set('business_name')} />}</Field>
          <Field label="Billing email">{(id) => <Input id={id} type="email" value={form.business_email} onChange={set('business_email')} />}</Field>
          <Field label="Phone">{(id) => <Input id={id} maxLength={50} value={form.phone} onChange={set('phone')} />}</Field>
          <Field label="Tax / VAT ID">{(id) => <Input id={id} maxLength={50} value={form.tax_id} onChange={set('tax_id')} />}</Field>
          <Field label="Address line 1" className="sm:col-span-2">{(id) => <Input id={id} maxLength={200} value={form.address_line1} onChange={set('address_line1')} />}</Field>
          <Field label="Address line 2" className="sm:col-span-2">{(id) => <Input id={id} maxLength={200} value={form.address_line2} onChange={set('address_line2')} />}</Field>
          <Field label="City">{(id) => <Input id={id} maxLength={100} value={form.city} onChange={set('city')} />}</Field>
          <Field label="State / region">{(id) => <Input id={id} maxLength={100} value={form.state} onChange={set('state')} />}</Field>
          <Field label="Postal code">{(id) => <Input id={id} maxLength={20} value={form.postal_code} onChange={set('postal_code')} />}</Field>
          <Field label="Country code" hint="2 letters, e.g. US">{(id) => <Input id={id} maxLength={2} value={form.country_code} onChange={set('country_code')} className="uppercase" />}</Field>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Invoice defaults</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Default currency">
            {(id) => (
              <Select id={id} value={form.default_currency} onChange={set('default_currency')}>
                {currencies.map((c) => <option key={c} value={c}>{currencyLabel(c)}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Payment terms (days)">{(id) => <Input id={id} type="number" min="0" max="365" value={form.default_payment_terms_days} onChange={set('default_payment_terms_days')} />}</Field>
          <Field label="Default tax rate (%)">{(id) => <Input id={id} type="number" min="0" max="100" step="0.01" value={form.default_tax_rate} onChange={set('default_tax_rate')} />}</Field>
          <Field label="Invoice number prefix" hint={`Next number: ${form.invoice_prefix || 'INV'}-${String(settings.next_invoice_number).padStart(4, '0')}`}>
            {(id) => <Input id={id} maxLength={10} pattern="[A-Za-z0-9-]{1,10}" value={form.invoice_prefix} onChange={set('invoice_prefix')} />}
          </Field>
          <Field label="Timezone" hint="IANA name, e.g. Asia/Kolkata — used for due and overdue dates">
            {(id) => <Input id={id} value={form.timezone} onChange={set('timezone')} />}
          </Field>
          <Field label="Default invoice notes" className="sm:col-span-2">{(id) => <Textarea id={id} maxLength={2000} value={form.invoice_footer} onChange={set('invoice_footer')} />}</Field>
        </div>
      </Card>
    </form>
  )
}
