import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { rangeFromParams } from '../lib/dateRange'

/** Date range stored in the URL (?range=30d or ?range=custom&from=..&to=..). */
export function useDateRangeParam(fallback = 'month') {
  const [params, setParams] = useSearchParams()
  const key = params.toString()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = useMemo(() => rangeFromParams(params, fallback), [key, fallback])

  const setRange = useCallback(
    (next) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          p.set('range', next.preset)
          if (next.preset === 'custom') {
            p.set('from', next.from)
            p.set('to', next.to)
          } else {
            p.delete('from')
            p.delete('to')
          }
          return p
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return [range, setRange, params, setParams]
}
