import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Load data from the API. `loader` receives an AbortSignal.
 * Returns { data, error, loading, reload, setData }.
 */
export function useApi(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const run = useCallback((signal) => {
    setState((s) => ({ ...s, loading: true, error: null }))
    return loaderRef
      .current(signal)
      .then((data) => {
        if (!signal?.aborted) setState({ data, error: null, loading: false })
      })
      .catch((error) => {
        if (error.name === 'AbortError' || signal?.aborted) return
        setState((s) => ({ ...s, error, loading: false }))
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    run(controller.signal)
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const reload = useCallback(() => run(), [run])
  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }))
  }, [])

  return { ...state, reload, setData }
}
