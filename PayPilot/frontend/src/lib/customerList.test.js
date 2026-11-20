import { describe, expect, it, vi } from 'vitest'
import { notifyCustomersChanged, onCustomersChanged, uniqueCustomers, upsertCustomer } from './customerList'

const c = (id, name, extra = {}) => ({ id, name, email: null, archived_at: null, ...extra })

describe('customer list helpers', () => {
  it('adds a new customer in alphabetical position without duplicates', () => {
    const list = [c('1', 'Beta'), c('2', 'delta')]
    const added = upsertCustomer(list, c('3', 'alpha'))
    expect(added.map((x) => x.name)).toEqual(['alpha', 'Beta', 'delta'])
    const again = upsertCustomer(added, c('3', 'Alpha Ltd'))
    expect(again.filter((x) => x.id === '3')).toHaveLength(1)
    expect(again[0].name).toBe('Alpha Ltd')
  })

  it('drops archived customers from the selectable list', () => {
    expect(upsertCustomer([c('1', 'A'), c('2', 'B')], c('1', 'A', { archived_at: '2026-11-12T00:00:00Z' }))).toEqual([c('2', 'B')])
  })

  it('de-duplicates a server response by id', () => {
    expect(uniqueCustomers([c('1', 'A'), c('1', 'A'), c('2', 'B')]).map((x) => x.id)).toEqual(['1', '2'])
  })

  it('notifies listeners in the same tab', () => {
    const fn = vi.fn()
    const off = onCustomersChanged(fn)
    notifyCustomersChanged(c('9', 'New'))
    expect(fn).toHaveBeenCalledWith(c('9', 'New'))
    off()
    notifyCustomersChanged(c('9', 'New'))
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
