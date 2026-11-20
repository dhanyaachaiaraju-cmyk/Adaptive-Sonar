import { describe, expect, it } from 'vitest'
import { currencyLabel, currencyName, currencySymbol } from './currencies'

describe('currency labels', () => {
  it('labels INR as Indian Rupee with the ₹ symbol', () => {
    expect(currencyName('INR')).toBe('Indian Rupee')
    expect(currencySymbol('INR')).toBe('₹')
    expect(currencyLabel('INR')).toBe('INR – Indian Rupee (₹)')
  })

  it('shows the correct local symbol for other currencies', () => {
    expect(currencySymbol('USD')).toBe('$')
    expect(currencySymbol('EUR')).toBe('€')
    expect(currencySymbol('GBP')).toBe('£')
    expect(currencyLabel('AED')).toMatch(/^AED – UAE Dirham|^AED – United Arab Emirates Dirham/)
  })

  it('does not repeat the code when a currency has no distinct symbol', () => {
    expect(currencyLabel('CHF')).toBe('CHF – Swiss Franc')
  })
})
