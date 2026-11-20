import { useId, useState } from 'react'
import { Button, Field, Input, Modal, Select, Textarea } from '../../components/ui'
import { currencyLabel } from '../../lib/currencies'
import CustomerForm from '../customers/LazyCustomerForm'
import { emptyItem } from './invoicePayload'

// One grid for the heading row and every line, so headings sit exactly over their inputs.
const LINE_GRID = 'grid grid-cols-12 items-start gap-x-2 gap-y-1'
const COLS = {
  description: 'col-span-12 sm:col-span-6',
  quantity: 'col-span-4 sm:col-span-2',
  unitPrice: 'col-span-5 sm:col-span-3',
  actions: 'col-span-3 sm:col-span-1',
}

function LineLabel({ htmlFor, children }) {
  // Visible on small screens (each line is a card); on wider screens the heading row labels the columns.
  return (
    <label htmlFor={htmlFor} className="mb-0.5 block text-xs font-medium text-slate-600 sm:sr-only">
      {children}
    </label>
  )
}

/**
 * Controlled invoice editor. `value` shape:
 * { customer_id, currency, issue_date, due_date, tax_rate, notes, items: [{description, quantity, unit_price}] }
 * `customers` is the owner's customer list; `onCustomerCreated` is called after
 * the inline "New customer" form saves. `customerSlot` replaces the picker.
 * `paypalCurrencies` (a Set) marks which currencies customers can pay via PayPal.
 */
export default function InvoiceEditor({
  value,
  onChange,
  currencies = [],
  paypalCurrencies = null,
  customers = [],
  customersLoading = false,
  customersError = null,
  onRetryCustomers,
  onCustomerCreated,
  customerSlot,
}) {
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)
  const uid = useId() // several editors can be on one page (assistant proposals)

  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value })
  const setItem = (index, key) => (e) =>
    onChange({ ...value, items: value.items.map((it, i) => (i === index ? { ...it, [key]: e.target.value } : it)) })
  const addItem = () => onChange({ ...value, items: [...value.items, emptyItem()] })
  const removeItem = (index) => onChange({ ...value, items: value.items.filter((_, i) => i !== index) })

  const noCustomers = !customersLoading && !customersError && customers.length === 0
  const paypalUnavailable = paypalCurrencies && value.currency && !paypalCurrencies.has(value.currency)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {customerSlot ?? (
          <Field
            label="Customer *"
            className="sm:col-span-2"
            error={customersError ? 'Could not load your customers.' : undefined}
            hint={noCustomers ? 'No customers yet - add one with “New”.' : undefined}
          >
            {(id) => (
              <div className="flex gap-2">
                <Select
                  id={id}
                  required
                  value={value.customer_id || ''}
                  onChange={set('customer_id')}
                  disabled={customersLoading && customers.length === 0}
                  aria-busy={customersLoading || undefined}
                >
                  <option value="" disabled>
                    {customersLoading && customers.length === 0
                      ? 'Loading customers…'
                      : customers.length === 0
                        ? 'No customers yet'
                        : 'Select a customer…'}
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.email ? ` — ${c.email}` : ' — (no email)'}
                    </option>
                  ))}
                </Select>
                {customersError && onRetryCustomers && (
                  <Button variant="secondary" onClick={onRetryCustomers} className="shrink-0">
                    Retry
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setNewCustomerOpen(true)} className="shrink-0">
                  New
                </Button>
              </div>
            )}
          </Field>
        )}
        <Field
          label="Currency"
          hint={
            paypalUnavailable
              ? `Customers can't pay ${value.currency} invoices through PayPal. You can still issue the invoice and collect payment another way.`
              : undefined
          }
        >
          {(id) => (
            <Select id={id} value={value.currency} onChange={set('currency')}>
              {(currencies.length ? currencies : [value.currency]).map((c) => (
                <option key={c} value={c}>{currencyLabel(c)}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Tax rate (%)">
          {(id) => <Input id={id} type="number" min="0" max="100" step="0.01" value={value.tax_rate} onChange={set('tax_rate')} />}
        </Field>
        <Field label="Issue date">{(id) => <Input id={id} type="date" value={value.issue_date} onChange={set('issue_date')} />}</Field>
        <Field label="Due date">
          {(id) => <Input id={id} type="date" min={value.issue_date} value={value.due_date} onChange={set('due_date')} />}
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Line items</h3>
          <Button size="sm" variant="secondary" onClick={addItem} disabled={value.items.length >= 100}>
            Add line
          </Button>
        </div>
        <div role="table" aria-label="Line items" className="space-y-2">
          <div
            role="row"
            className={`${LINE_GRID} hidden border-b border-slate-200 pb-1 text-xs font-medium tracking-wide text-slate-500 uppercase sm:grid`}
          >
            <span role="columnheader" className={COLS.description}>Description</span>
            <span role="columnheader" className={`${COLS.quantity} text-right`}>Quantity</span>
            <span role="columnheader" className={`${COLS.unitPrice} text-right`}>Unit price ({value.currency})</span>
            <span role="columnheader" className={`${COLS.actions} text-center`}>Actions</span>
          </div>
          {value.items.map((item, i) => {
            const base = `${uid}-line-${i}`
            return (
              <div key={i} role="row" className={`${LINE_GRID} rounded-lg border border-slate-200 p-2 sm:border-0 sm:p-0`}>
                <div role="cell" className={COLS.description}>
                  <LineLabel htmlFor={`${base}-description`}>Description</LineLabel>
                  <Input
                    id={`${base}-description`}
                    aria-label={`Line ${i + 1} description`}
                    placeholder="What you're billing for"
                    required
                    maxLength={500}
                    value={item.description}
                    onChange={setItem(i, 'description')}
                  />
                </div>
                <div role="cell" className={COLS.quantity}>
                  <LineLabel htmlFor={`${base}-quantity`}>Quantity</LineLabel>
                  <Input
                    id={`${base}-quantity`}
                    aria-label={`Line ${i + 1} quantity`}
                    type="number"
                    inputMode="decimal"
                    min="0.001"
                    step="0.001"
                    required
                    value={item.quantity}
                    onChange={setItem(i, 'quantity')}
                    className="text-right"
                  />
                </div>
                <div role="cell" className={COLS.unitPrice}>
                  <LineLabel htmlFor={`${base}-unit-price`}>Unit price ({value.currency})</LineLabel>
                  <Input
                    id={`${base}-unit-price`}
                    aria-label={`Line ${i + 1} unit price`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={item.unit_price}
                    onChange={setItem(i, 'unit_price')}
                    className="text-right"
                  />
                </div>
                <div role="cell" className={COLS.actions}>
                  <span aria-hidden="true" className="mb-0.5 block text-xs font-medium text-slate-600 sm:hidden">&nbsp;</span>
                  <Button
                    variant="ghost"
                    aria-label={`Remove line ${i + 1}`}
                    title="Remove line"
                    onClick={() => removeItem(i)}
                    disabled={value.items.length === 1}
                    className="w-full"
                  >
                    ✕
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">Totals are recalculated by the server when you save; the preview is an estimate.</p>
      </div>

      <Field label="Notes / payment terms">
        {(id) => <Textarea id={id} maxLength={5000} value={value.notes ?? ''} onChange={set('notes')} />}
      </Field>

      <Modal open={newCustomerOpen} title="New customer" onClose={() => setNewCustomerOpen(false)} size="lg">
        <CustomerForm
          onCancel={() => setNewCustomerOpen(false)}
          onSaved={(c) => {
            setNewCustomerOpen(false)
            onCustomerCreated?.(c)
            onChange({ ...value, customer_id: c.id })
          }}
        />
      </Modal>
    </div>
  )
}
