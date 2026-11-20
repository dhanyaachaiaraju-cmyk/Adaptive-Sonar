import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../lib/apiClient'
import { useApi } from '../hooks/useApi'
import { useCustomers } from '../hooks/useCustomers'
import { addDaysISO, estimateTotals, todayISO } from '../lib/format'
import { Button, Card, ErrorBanner, PageHeader } from '../components/ui'
import Spinner from '../components/Spinner'
import InvoiceEditor from '../features/invoices/InvoiceEditor'
import InvoicePreview from '../features/invoices/InvoicePreview'
import { emptyItem, fromInvoice, toInvoicePayload } from '../features/invoices/invoicePayload'

export default function InvoiceFormPage() {
  const { invoiceId } = useParams()
  const meta = useApi(
    (signal) =>
      Promise.all([
        api.get('/v1/settings/business', { signal }),
        api.get('/v1/settings/currency-options', { signal }),
        invoiceId ? api.get(`/v1/invoices/${invoiceId}`, { signal }) : Promise.resolve(null),
      ]),
    [invoiceId],
  )

  if (meta.error) return <ErrorBanner error={meta.error} />
  if (!meta.data) return <Spinner label="Loading" />
  const [business, currencyOptions, existing] = meta.data
  if (existing && existing.status !== 'draft') {
    return <ErrorBanner error="Only draft invoices can be edited. Issued invoices are locked to protect the payment record." />
  }
  return (
    <InvoiceForm
      key={invoiceId ?? 'new'}
      business={business}
      currencyOptions={currencyOptions}
      existing={existing}
    />
  )
}

function InvoiceForm({ business, currencyOptions, existing }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Shared, self-refreshing list: a customer created here, on the Customers page
  // or in another tab appears in the dropdown straight away.
  const { customers, loading: customersLoading, error: customersError, reload: reloadCustomers, addCustomer } = useCustomers()
  const currencies = useMemo(() => currencyOptions.map((o) => o.code), [currencyOptions])
  const paypalCurrencies = useMemo(() => new Set(currencyOptions.filter((o) => o.paypal_checkout).map((o) => o.code)), [currencyOptions])
  const [value, setValue] = useState(() => {
    if (existing) return fromInvoice(existing)
    const issue = todayISO()
    return {
      customer_id: params.get('customer_id') || '',
      currency: business.default_currency,
      issue_date: issue,
      due_date: addDaysISO(issue, business.default_payment_terms_days),
      tax_rate: business.default_tax_rate,
      notes: business.invoice_footer ?? '',
      items: [emptyItem()],
    }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const totals = useMemo(() => estimateTotals(value.items, value.tax_rate), [value])

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = toInvoicePayload(value)
      const saved = existing
        ? await api.patch(`/v1/invoices/${existing.id}`, { ...payload, version: existing.version })
        : await api.post('/v1/invoices', payload)
      navigate(`/invoices/${saved.id}`)
    } catch (err) {
      setError(err)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save}>
      <PageHeader
        title={existing ? 'Edit draft' : 'New invoice'}
        description="Saved as a draft. Nothing is issued or sent until you approve it."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</Button>
          </>
        }
      />
      <ErrorBanner error={error} className="mb-4" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <InvoiceEditor
            value={value}
            onChange={setValue}
            currencies={currencies}
            paypalCurrencies={paypalCurrencies}
            customers={customers}
            customersLoading={customersLoading}
            customersError={customersError}
            onRetryCustomers={reloadCustomers}
            onCustomerCreated={addCustomer}
          />
        </Card>
        <div className="lg:sticky lg:top-4 lg:self-start">
          <InvoicePreview
            invoice={{ ...value, invoice_number: existing?.invoice_number }}
            business={business}
            totals={totals}
            estimate
            customer={customers.find((c) => c.id === value.customer_id) ?? {}}
          />
        </div>
      </div>
    </form>
  )
}
