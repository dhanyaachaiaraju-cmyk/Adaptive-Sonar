/*
 * Shared customer-list state helpers. Any screen that creates, edits or
 * archives a customer calls notifyCustomersChanged(); every open customer list
 * (in this tab and other tabs of the same browser) then refetches from the API.
 */

const CHANNEL = 'paypilot:customers'

export function sortCustomers(list) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/** Insert or replace by id - never produces duplicates. Archived customers are dropped. */
export function upsertCustomer(list, customer) {
  const rest = list.filter((c) => c.id !== customer.id)
  return sortCustomers(customer.archived_at ? rest : [...rest, customer])
}

/** De-duplicate a server response by id (defensive: paging/races can repeat rows). */
export function uniqueCustomers(list) {
  const seen = new Map()
  for (const c of list) seen.set(c.id, c)
  return sortCustomers([...seen.values()])
}

const localListeners = new Set()
let channel = null

function getChannel() {
  if (channel === null) {
    channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : false
  }
  return channel || null
}

export function notifyCustomersChanged(customer) {
  for (const fn of localListeners) fn(customer)
  try {
    // Ids only cross tabs; the receiving tab refetches through its own authenticated session.
    getChannel()?.postMessage({ type: 'changed', id: customer?.id ?? null })
  } catch {
    /* channel closed - other tabs will refetch on focus instead */
  }
}

export function onCustomersChanged(fn) {
  localListeners.add(fn)
  const ch = getChannel()
  const onMessage = () => fn(null)
  ch?.addEventListener('message', onMessage)
  return () => {
    localListeners.delete(fn)
    ch?.removeEventListener('message', onMessage)
  }
}
