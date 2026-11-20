import { describe, expect, it } from 'vitest'
import { parseISO, presetRange, rangeFromParams, validateDateRange } from './dateRange'

const TODAY = new Date(2026, 10, 12) // 12 Nov 2026 (months are 0-based)

describe('parseISO', () => {
  it('accepts real dates and rejects impossible or malformed ones', () => {
    expect(parseISO('2026-02-28')).not.toBeNull()
    expect(parseISO('2026-02-30')).toBeNull()
    expect(parseISO('2026-13-01')).toBeNull()
    expect(parseISO('12/11/2026')).toBeNull()
    expect(parseISO('')).toBeNull()
    expect(parseISO(undefined)).toBeNull()
  })
})

describe('validateDateRange', () => {
  it('accepts a valid range, including a single day', () => {
    expect(validateDateRange('2026-11-01', '2026-11-12', TODAY)).toBeNull()
    expect(validateDateRange('2026-11-12', '2026-11-12', TODAY)).toBeNull()
  })
  it('rejects missing, invalid, reversed, future and over-long ranges', () => {
    expect(validateDateRange('', '2026-11-12', TODAY)).toMatch(/both/)
    expect(validateDateRange('2026-02-30', '2026-11-12', TODAY)).toMatch(/start date is not a valid date/)
    expect(validateDateRange('2026-11-10', '2026-11-01', TODAY)).toMatch(/on or before/)
    expect(validateDateRange('2026-11-01', '2026-11-13', TODAY)).toMatch(/future/)
    expect(validateDateRange('2010-01-01', '2026-11-12', TODAY)).toMatch(/10 years/)
  })
})

describe('presetRange', () => {
  it('computes calendar presets relative to today', () => {
    expect(presetRange('month', TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-12' })
    expect(presetRange('last_month', TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(presetRange('30d', TODAY)).toEqual({ from: '2026-10-14', to: '2026-11-12' })
    expect(presetRange('quarter', TODAY)).toEqual({ from: '2026-10-01', to: '2026-11-12' })
    expect(presetRange('year', TODAY)).toEqual({ from: '2026-01-01', to: '2026-11-12' })
    expect(presetRange('12m', TODAY)).toEqual({ from: '2025-11-13', to: '2026-11-12' })
  })
  it('handles January for last month', () => {
    expect(presetRange('last_month', new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })
})

describe('rangeFromParams', () => {
  it('uses a valid custom range from the URL', () => {
    const params = new URLSearchParams('range=custom&from=2026-06-01&to=2026-06-30')
    expect(rangeFromParams(params, 'month', TODAY)).toEqual({ preset: 'custom', from: '2026-06-01', to: '2026-06-30' })
  })
  it('falls back to the default preset for invalid or unknown input', () => {
    expect(rangeFromParams(new URLSearchParams('range=custom&from=2026-06-30&to=2026-06-01'), 'month', TODAY)).toEqual({
      preset: 'month',
      from: '2026-11-01',
      to: '2026-11-12',
    })
    expect(rangeFromParams(new URLSearchParams('range=bogus'), '30d', TODAY).preset).toBe('30d')
  })
})
