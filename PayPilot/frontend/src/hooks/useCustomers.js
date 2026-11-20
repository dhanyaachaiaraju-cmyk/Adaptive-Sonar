import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/apiClient'
import { notifyCustomersChanged, onCustomersChanged, uniqueCustomers, upsertCustomer } from '../lib/customerList'

/**
 * The signed-in owner's active customers (the API + RLS only ever return the
 * owner's own rows). Refetches when a customer is saved anywhere in the app,
 * in another tab, or when the window regains focus - so the invoice dropdown
 * never shows a stale list.
 *
 * Returns { customers, loading, error, reload, addCustomer }.
 */
export function useCustomers({ initial } = {}) {
  const [state, setState] = useState(() => ({
    customers: initial ? uniqueCustomers(initial) : [],
    loading: !initial,
    error: null,
  }))
  const controllerRef = useRef(null)

  const reload = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await api.get('/v1/customers?limit=200', { signal: controller.signal })
      if (!controller.signal.aborted) setState({ customers: uniqueCustomers(res.items), loading: false, error: null })
    } catch (error) {
      if (error.name === 'AbortError' || controller.signal.aborted) return
      setState((s) => ({ ...s, loading: false, error }))
    }
  }, [])

  /** Show a just-created customer immediately, tell other lists, then confirm with the server. */
  const addCustomer = useCallback(
    (customer) => {
      setState((s) => ({ ...s, customers: upsertCustomer(s.customers, customer) }))
      notifyCustomersChanged(customer)
    },
    [],
  )

  useEffect(() => {
    if (!initial) reload()
    const off = onCustomersChanged((customer) => {
      if (customer) setState((s) => ({ ...s, customers: upsertCustomer(s.customers, customer) }))
      reload()
    })
    const onFocus = () => document.visibilityState !== 'hidden' && reload()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      off()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
      controllerRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ...state, reload, addCustomer }
}
