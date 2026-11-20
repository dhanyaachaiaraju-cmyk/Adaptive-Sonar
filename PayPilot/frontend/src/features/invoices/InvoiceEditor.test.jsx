// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/apiClient', () => ({ api: { post: vi.fn(), patch: vi.fn(), get: vi.fn() } }))
vi.mock('flag-icons/css/flag-icons.min.css', () => ({}))

const { api } = await import('../../lib/apiClient')
const { default: InvoiceEditor } = await import('./InvoiceEditor')
const { useCustomers } = await import('../../hooks/useCustomers')
const { notifyCustomersChanged } = await import('../../lib/customerList')

const blank = {
  customer_id: '',
  currency: 'USD',
  issue_date: '2026-11-12',
  due_date: '2026-11-26',
  tax_rate: '0',
  notes: '',
  items: [{ description: '', quantity: '1', unit_price: '' }],
}

/** Mirrors InvoiceFormPage: the editor inside a <form>, fed by useCustomers(). */
function Harness({ onOuterSubmit = () => {}, paypal = ['USD'] }) {
  const [value, setValue] = useState(blank)
  const { customers, loading, error, reload, addCustomer } = useCustomers()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onOuterSubmit()
      }}
    >
      <InvoiceEditor
        value={value}
        onChange={setValue}
        currencies={['INR', 'USD']}
        paypalCurrencies={new Set(paypal)}
        customers={customers}
        customersLoading={loading}
        customersError={error}
        onRetryCustomers={reload}
        onCustomerCreated={addCustomer}
      />
      <output data-testid="selected">{value.customer_id}</output>
    </form>
  )
}

const customer = (id, name) => ({ id, name, email: `${id}@example.com`, archived_at: null })

describe('InvoiceEditor', () => {
  beforeEach(() => vi.clearAllMocks())

  it('labels line-item columns and keeps labels on every added line', async () => {
    api.get.mockResolvedValue({ items: [] })
    const user = userEvent.setup()
    render(<Harness />)
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Description', 'Quantity', 'Unit price (USD)', 'Actions'])
    await user.click(screen.getByRole('button', { name: 'Add line' }))
    expect(screen.getByLabelText('Line 2 description')).toBeTruthy()
    expect(screen.getAllByText('Quantity', { selector: 'label' })).toHaveLength(2) // per-line labels for small screens
    expect(screen.getByRole('button', { name: 'Remove line 2' })).toBeTruthy()
  })

  it('offers INR with its name and symbol and warns that PayPal cannot collect it', async () => {
    api.get.mockResolvedValue({ items: [] })
    const user = userEvent.setup()
    render(<Harness />)
    const select = screen.getByLabelText('Currency')
    expect(within(select).getByRole('option', { name: 'INR – Indian Rupee (₹)' })).toBeTruthy()
    await user.selectOptions(select, 'INR')
    expect(screen.getByText(/can't pay INR invoices through PayPal/)).toBeTruthy()
    expect(screen.getAllByRole('columnheader')[2].textContent).toBe('Unit price (INR)')
  })

  it('shows loading, empty and error states for the customer list', async () => {
    let fail = true
    api.get.mockImplementation(() => (fail ? Promise.reject(new Error('down')) : Promise.resolve({ items: [] })))
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByRole('option', { name: 'Loading customers…' })).toBeTruthy()
    expect(await screen.findByText('Could not load your customers.')).toBeTruthy()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/No customers yet - add one/)).toBeTruthy()
  })

  it('makes a customer created in the dialog immediately selectable without submitting the invoice', async () => {
    api.get.mockResolvedValue({ items: [customer('b', 'Beta')] })
    const created = customer('a', 'Acme')
    api.post.mockResolvedValue(created)
    const onOuterSubmit = vi.fn()
    const user = userEvent.setup()
    render(<Harness onOuterSubmit={onOuterSubmit} />)
    await screen.findByRole('option', { name: /Beta/ })

    await user.click(screen.getByRole('button', { name: 'New' }))
    const dialog = screen.getByRole('dialog', { name: 'New customer' })
    await user.type(await within(dialog).findByLabelText('Name *'), 'Acme') // form is lazy-loaded
    // The server list now includes the new customer too (refetch must not duplicate it).
    api.get.mockResolvedValue({ items: [customer('b', 'Beta'), created] })
    await user.click(within(dialog).getByRole('button', { name: 'Add customer' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onOuterSubmit).not.toHaveBeenCalled() // the nested form no longer submits the invoice
    expect(screen.getByTestId('selected').textContent).toBe('a')
    const picker = screen.getByLabelText('Customer *')
    expect(picker).toHaveProperty('value', 'a')
    await waitFor(() => expect(within(picker).getAllByRole('option', { name: /Acme/ })).toHaveLength(1))
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Select a customer…',
      'Acme — a@example.com',
      'Beta — b@example.com',
    ])
  })

  // Regression: in real browsers (Edge/Chrome) the "New customer" form, when nested inside the
  // invoice <form> in the DOM, never reached React's submit handler. The browser did a native
  // full-page submit instead: the page reloaded, no POST was sent and the dropdown stayed empty.
  it('renders the New customer dialog outside the invoice form, so forms are never nested', async () => {
    api.get.mockResolvedValue({ items: [] })
    const user = userEvent.setup()
    const { container } = render(<Harness />)
    await screen.findByText(/No customers yet - add one/)
    await user.click(screen.getByRole('button', { name: 'New' }))
    const dialog = screen.getByRole('dialog', { name: 'New customer' })
    await within(dialog).findByLabelText('Name *')
    const invoiceForm = container.querySelector('form')
    expect(invoiceForm.contains(dialog)).toBe(false)
    expect(document.querySelectorAll('form form')).toHaveLength(0)
    expect(within(dialog).getByRole('button', { name: 'Add customer' }).form.contains(dialog)).toBe(false)
    expect(dialog.querySelector('form').parentElement.closest('form')).toBeNull()
  })

  it('creates exactly one customer when "Add customer" is double-clicked', async () => {
    api.get.mockResolvedValue({ items: [] })
    let finish
    api.post.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'New' }))
    const dialog = screen.getByRole('dialog', { name: 'New customer' })
    await user.type(await within(dialog).findByLabelText('Name *'), 'Acme')
    const add = within(dialog).getByRole('button', { name: 'Add customer' })
    await user.dblClick(add)
    await user.keyboard('{Enter}')
    expect(api.post).toHaveBeenCalledTimes(1)
    await act(async () => finish(customer('a', 'Acme')))
    await waitFor(() => expect(screen.getByTestId('selected').textContent).toBe('a'))
  })

  it('still lists the saved customer after the page is reloaded', async () => {
    api.get.mockResolvedValue({ items: [] })
    api.post.mockResolvedValue(customer('a', 'Acme'))
    const user = userEvent.setup()
    const first = render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'New' }))
    await user.type(await within(screen.getByRole('dialog')).findByLabelText('Name *'), 'Acme')
    api.get.mockResolvedValue({ items: [customer('a', 'Acme')] }) // the server now has it
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add customer' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    first.unmount() // "refresh": a brand-new page instance loads the list from the API

    render(<Harness />)
    const picker = screen.getByLabelText('Customer *')
    expect(await within(picker).findByRole('option', { name: 'Acme — a@example.com' })).toBeTruthy()
    expect(api.get).toHaveBeenLastCalledWith('/v1/customers?limit=200', expect.anything())
  })

  it('refreshes when a customer is created elsewhere (another page or tab)', async () => {
    api.get.mockResolvedValue({ items: [] })
    render(<Harness />)
    await screen.findByText(/No customers yet - add one/)
    api.get.mockResolvedValue({ items: [customer('z', 'Zeta')] })
    await act(async () => notifyCustomersChanged(null))
    expect(await screen.findByRole('option', { name: /Zeta/ })).toBeTruthy()
    expect(api.get).toHaveBeenLastCalledWith('/v1/customers?limit=200', expect.anything())
  })
})
