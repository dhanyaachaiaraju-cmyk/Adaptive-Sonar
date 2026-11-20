// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/apiClient', () => ({ api: { post: vi.fn(), patch: vi.fn(), get: vi.fn() } }))
vi.mock('flag-icons/css/flag-icons.min.css', () => ({}))

const { api } = await import('../../lib/apiClient')
const { default: CustomerForm } = await import('./CustomerForm')

async function pickCountry(user, query, optionName) {
  const box = screen.getByRole('combobox', { name: 'Country' })
  await user.click(box)
  await user.type(box, query)
  const list = screen.getByRole('listbox', { name: 'Countries' })
  // Exact name, so "India" does not also match "British Indian Ocean Territory".
  const exact = (name) => name.replace(/\s*\+\d+$/, '') === optionName
  await user.click(within(list).getByRole('option', { name: exact }))
}

describe('CustomerForm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('finds India by calling code and sets the phone calling code to +91', async () => {
    const user = userEvent.setup()
    render(<CustomerForm onSaved={() => {}} />)
    await pickCountry(user, '+91', 'India')
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveProperty('value', 'India (+91)')
    expect(screen.getByRole('combobox', { name: 'Phone calling code' })).toHaveProperty('value', '+91')
  })

  it('finds the same country by name', async () => {
    const user = userEvent.setup()
    render(<CustomerForm onSaved={() => {}} />)
    await pickCountry(user, 'indi', 'India')
    expect(screen.getByRole('combobox', { name: 'Phone calling code' })).toHaveProperty('value', '+91')
  })

  it('lets the calling code be changed independently of the country', async () => {
    const user = userEvent.setup()
    render(<CustomerForm onSaved={() => {}} />)
    const code = screen.getByRole('combobox', { name: 'Phone calling code' })
    await user.click(code)
    await user.type(code, '+44')
    await user.click(within(screen.getByRole('listbox', { name: 'Calling codes' })).getByRole('option', { name: /United Kingdom/ }))
    await pickCountry(user, 'India', 'India')
    expect(code).toHaveProperty('value', '+44') // not overwritten once chosen
  })

  it('restricts numeric-only postal codes but keeps alphanumeric ones', async () => {
    const user = userEvent.setup()
    render(<CustomerForm onSaved={() => {}} />)
    await pickCountry(user, 'India', 'India')
    const postal = screen.getByLabelText('Postal / ZIP code')
    expect(postal).toHaveProperty('inputMode', 'numeric')
    await user.type(postal, '56A0034')
    expect(postal).toHaveProperty('value', '560034')

    await pickCountry(user, 'United Kingdom', 'United Kingdom')
    await user.clear(postal)
    await user.type(postal, 'SW1A 1AA')
    expect(postal).toHaveProperty('value', 'SW1A 1AA')
  })

  it('blocks submission with a clear message for an invalid phone number', async () => {
    const user = userEvent.setup()
    render(<CustomerForm onSaved={() => {}} />)
    await user.type(screen.getByLabelText('Name *'), 'Asha')
    await pickCountry(user, 'India', 'India')
    await user.type(screen.getByLabelText('Phone'), '98765')
    await user.click(screen.getByRole('button', { name: 'Add customer' }))
    expect(await screen.findByText(/too short/)).toBeTruthy()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('sends the phone as E.164 and the normalised postal code', async () => {
    const user = userEvent.setup()
    const saved = { id: 'c1', name: 'Asha' }
    api.post.mockResolvedValue(saved)
    const onSaved = vi.fn()
    render(<CustomerForm onSaved={onSaved} />)
    await user.type(screen.getByLabelText('Name *'), 'Asha')
    await pickCountry(user, 'India', 'India')
    await user.type(screen.getByLabelText('Phone'), '98765 43210')
    await user.type(screen.getByLabelText('Postal / ZIP code'), '560 034')
    await user.click(screen.getByRole('button', { name: 'Add customer' }))
    expect(api.post).toHaveBeenCalledWith(
      '/v1/customers',
      expect.objectContaining({ name: 'Asha', phone: '+919876543210', country_code: 'IN', postal_code: '560 034' }),
    )
    expect(onSaved).toHaveBeenCalledWith(saved)
  })

  it('shows server-side field errors next to the field', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValue(Object.assign(new Error('Request validation failed.'), {
      details: [{ loc: ['body', 'postal_code'], msg: 'Not a valid postal code for IN' }],
    }))
    render(<CustomerForm onSaved={() => {}} />)
    await user.type(screen.getByLabelText('Name *'), 'Asha')
    await user.click(screen.getByRole('button', { name: 'Add customer' }))
    expect(await screen.findByText('Not a valid postal code for IN')).toBeTruthy()
    expect(screen.getByText('Please correct the highlighted fields.')).toBeTruthy()
  })
})
