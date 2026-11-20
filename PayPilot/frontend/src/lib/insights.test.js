import { describe, expect, it } from 'vitest'
import { describeChange, formatMonth, meterWidth, niceScale, seriesFor } from './insights'

describe('formatMonth', () => {
  it('formats YYYY-MM and leaves bad input untouched', () => {
    expect(formatMonth('2026-03')).toBe('Mar 2026')
    expect(formatMonth('2026-12', { short: true })).toBe('Dec')
    expect(formatMonth('2026-13')).toBe('2026-13')
  })
})

describe('niceScale', () => {
  it('rounds the axis up to a nice maximum with even ticks', () => {
    expect(niceScale(0, 1730)).toEqual({ min: 0, max: 2000, ticks: [0, 500, 1000, 1500, 2000] })
    expect(niceScale(0, 95)).toEqual({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] })
  })
  it('includes zero and handles negative months (refunds larger than collections)', () => {
    const s = niceScale(-30, 120)
    expect(s.min).toBeLessThan(0)
    expect(s.ticks).toContain(0)
    expect(s.max).toBeGreaterThanOrEqual(120)
  })
  it('handles an all-zero series', () => {
    expect(niceScale(0, 0)).toEqual({ min: 0, max: 1, ticks: [0, 1] })
  })
})

describe('describeChange', () => {
  it('reports direction and tone without recomputing figures', () => {
    expect(describeChange('50.00', '100.0')).toEqual({ direction: 'up', tone: 'good', pctLabel: '+100.0%' })
    expect(describeChange('-25.00', '-14.3')).toEqual({ direction: 'down', tone: 'bad', pctLabel: '-14.3%' })
    expect(describeChange('0.00', '0.0')).toEqual({ direction: 'flat', tone: 'neutral', pctLabel: '0.0%' })
  })
  it('says there is no baseline rather than inventing a percentage', () => {
    expect(describeChange('70.00', null)).toEqual({ direction: 'none', tone: 'neutral', pctLabel: 'no previous data' })
  })
})

describe('meterWidth', () => {
  it('clamps to 0-100 and tolerates missing values', () => {
    expect(meterWidth('66.7')).toBe(66.7)
    expect(meterWidth('140')).toBe(100)
    expect(meterWidth(null)).toBe(0)
  })
})

describe('seriesFor', () => {
  it('picks the currency series and exposes numeric values for layout only', () => {
    const monthly = { series: [{ currency: 'USD', points: [{ month: '2026-01', collected_net: '120.00' }] }] }
    expect(seriesFor(monthly, 'USD')).toEqual([{ month: '2026-01', collected_net: '120.00', value: 120 }])
    expect(seriesFor(monthly, 'EUR')).toEqual([])
  })
})
