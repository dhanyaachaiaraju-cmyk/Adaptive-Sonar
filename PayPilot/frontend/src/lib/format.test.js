import { describe, expect, it } from 'vitest'
import { estimateTotals, formatMoney } from './format'
import { paymentStatusInfo } from './paymentStatus'

describe('estimateTotals', () => {
  it('matches the server rounding for common cases (integer cents, half-up tax)', () => {
    const items = [
      { quantity: '1', unit_price: '1200.00' },
      { quantity: '3', unit_price: '19.99' },
    ]
    expect(estimateTotals(items, '10')).toEqual({ subtotal: '1259.97', tax: '126.00', total: '1385.97' })
  })
  it('avoids floating point drift', () => {
    expect(estimateTotals([{ quantity: '3', unit_price: '0.10' }], '0').total).toBe('0.30')
  })
  it('treats empty inputs as zero', () => {
    expect(estimateTotals([{ quantity: '', unit_price: '' }], '')).toEqual({ subtotal: '0.00', tax: '0.00', total: '0.00' })
  })
})

describe('formatMoney', () => {
  it('formats per currency and shows a dash for missing values', () => {
    expect(formatMoney('1500.5', 'USD')).toContain('1,500.50')
    expect(formatMoney(null, 'USD')).toBe('—')
  })
})

describe('paymentStatusInfo', () => {
  it('only calls a completed payment "Completed"', () => {
    expect(paymentStatusInfo('completed').label).toBe('Completed')
    expect(paymentStatusInfo('pending').help).toMatch(/not confirmed/)
    expect(paymentStatusInfo('created').help).toMatch(/not paid/)
  })
})
