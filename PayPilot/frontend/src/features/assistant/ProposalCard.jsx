import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/apiClient'
import { estimateTotals, formatMoney } from '../../lib/format'
import { Button, ErrorBanner, Field, Input, Modal, Select, StatusBadge } from '../../components/ui'
import InvoiceEditor from '../invoices/InvoiceEditor'
import InvoicePreview from '../invoices/InvoicePreview'
import { toInvoicePayload } from '../invoices/invoicePayload'

function CustomerChooser({ customer, onChange, customers }) {
  const mode = customer.existing_customer_id ? 'existing' : 'new'
  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={mode === 'existing'}
            disabled={customers.length === 0}
            onChange={() => onChange({ ...customer, existing_customer_id: customers[0]?.id ?? null })}
          />
          Existing customer
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={mode === 'new'} onChange={() => onChange({ ...customer, existing_customer_id: null })} />
          New customer
        </label>
      </div>
      {mode === 'existing' ? (
        <Field label="Customer">
          {(id) => (
            <Select id={id} value={customer.existing_customer_id} onChange={(e) => onChange({ ...customer, existing_customer_id: e.target.value })}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ''}</option>
              ))}
            </Select>
          )}
        </Field>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name *">{(id) => <Input id={id} required value={customer.name ?? ''} onChange={(e) => onChange({ ...customer, name: e.target.value })} />}</Field>
          <Field label="Email">{(id) => <Input id={id} type="email" value={customer.email ?? ''} onChange={(e) => onChange({ ...customer, email: e.target.value })} />}</Field>
          <Field label="Company">{(id) => <Input id={id} value={customer.company_name ?? ''} onChange={(e) => onChange({ ...customer, company_name: e.target.value })} />}</Field>
        </div>
      )}
    </div>
  )
}

export default function ProposalCard({ proposal: initial, business, currencies, customers }) {
  const [proposal, setProposal] = useState(initial)
  const payload = proposal.payload
  const [editing, setEditing] = useState(false)
  const [customer, setCustomer] = useState(payload.customer)
  const [value, setValue] = useState(() => ({ ...payload.invoice, notes: payload.invoice.notes ?? '' }))
  const [confirm, setConfirm] = useState(null) // 'create_draft' | 'create_and_issue'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [invoice, setInvoice] = useState(null)

  const totals = useMemo(() => estimateTotals(value.items, value.tax_rate), [value])
  const selectedCustomer = customer.existing_customer_id ? customers.find((c) => c.id === customer.existing_customer_id) ?? customer : customer
  const pending = proposal.status === 'pending'

  async function decide(action) {
    setBusy(true)
    setError(null)
    try {
      if (action === 'reject') {
        setProposal(await api.post(`/v1/assistant/proposals/${proposal.id}/reject`))
      } else {
        const { customer_id: _ignored, ...invoicePayload } = toInvoicePayload(value)
        const res = await api.post(`/v1/assistant/proposals/${proposal.id}/approve`, {
          customer: {
            existing_customer_id: customer.existing_customer_id || null,
            name: customer.existing_customer_id ? null : customer.name?.trim() || null,
            email: customer.existing_customer_id ? null : customer.email?.trim() || null,
            company_name: customer.existing_customer_id ? null : customer.company_name?.trim() || null,
          },
          invoice: invoicePayload,
          action,
        })
        setProposal(res.proposal)
        setInvoice(res.invoice)
      }
      setConfirm(null)
      setEditing(false)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">Invoice proposal</span>
          <StatusBadge status={proposal.status === 'executed' ? 'paid' : proposal.status === 'pending' ? 'pending' : 'cancelled'} />
          <span className="text-xs text-slate-500">
            {proposal.status === 'pending' ? 'Awaiting your approval' : proposal.status === 'executed' ? 'Approved' : proposal.status}
          </span>
        </div>
        {pending && !editing && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => decide('reject')} disabled={busy}>Reject</Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirm('create_draft')}>Approve as draft</Button>
            <Button size="sm" onClick={() => setConfirm('create_and_issue')}>Approve &amp; issue</Button>
          </div>
        )}
      </div>

      {(payload.warnings?.length > 0 || payload.assumptions?.length > 0) && pending && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">Please check before approving:</p>
          <ul className="mt-1 list-disc pl-4">
            {[...(payload.warnings ?? []), ...(payload.assumptions ?? [])].map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <ErrorBanner error={!confirm && error} className="mb-3" />

      {editing ? (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <InvoiceEditor
            value={value}
            onChange={setValue}
            currencies={currencies}
            customers={customers}
            customerSlot={<CustomerChooser customer={customer} onChange={setCustomer} customers={customers} />}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)}>Done editing</Button>
          </div>
        </div>
      ) : invoice ? (
        <div className="rounded-lg border border-emerald-200 bg-white p-4 text-sm">
          <p className="font-medium text-emerald-800">
            {invoice.status === 'pending'
              ? `Invoice ${invoice.invoice_number} issued for ${formatMoney(invoice.total, invoice.currency)}.`
              : `Draft invoice saved for ${formatMoney(invoice.total, invoice.currency)}.`}
          </p>
          <Link to={`/invoices/${invoice.id}`} className="mt-1 inline-block font-medium text-brand-600 hover:underline">
            Open invoice →
          </Link>
        </div>
      ) : proposal.status === 'executed' && proposal.invoice_id ? (
        <Link to={`/invoices/${proposal.invoice_id}`} className="text-sm font-medium text-brand-600 hover:underline">Open the invoice →</Link>
      ) : (
        <InvoicePreview invoice={value} business={business} customer={selectedCustomer} totals={totals} estimate />
      )}

      <Modal
        open={confirm !== null}
        title={confirm === 'create_and_issue' ? 'Approve and issue this invoice?' : 'Save this invoice as a draft?'}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>Back</Button>
            <Button onClick={() => decide(confirm)} disabled={busy}>
              {busy ? 'Working…' : confirm === 'create_and_issue' ? `Issue for ${formatMoney(totals.total, value.currency)}` : 'Save draft'}
            </Button>
          </>
        }
      >
        <ErrorBanner error={error} className="mb-3" />
        <p className="text-sm text-slate-600">
          Customer: <strong>{selectedCustomer.name}</strong>
          {!customer.existing_customer_id && ' (will be added as a new customer)'}
        </p>
        <p className="mt-1 text-sm text-slate-600">Total (server will confirm): <strong>{formatMoney(totals.total, value.currency)}</strong></p>
        {confirm === 'create_and_issue' && (
          <p className="mt-3 text-sm text-slate-600">
            The invoice number is assigned, amounts are locked and a payment link is created. Nothing is emailed automatically.
          </p>
        )}
      </Modal>
    </div>
  )
}
