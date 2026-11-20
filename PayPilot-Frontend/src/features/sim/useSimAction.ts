import { useCallback, useState } from 'react'
import { useToast } from '../../components/ui/toast-context'
import { ApiError } from '../../lib/api'
import { refreshNow } from './store'

/** Runs a backend action, reports failures as a toast and refreshes live state on success. */
export function useSimAction() {
  const { toast } = useToast()
  const [pending, setPending] = useState<string | null>(null)

  const run = useCallback(
    async <T,>(key: string, action: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setPending(key)
      try {
        const result = await action()
        if (success) toast({ title: success, tone: 'success' })
        refreshNow()
        return result
      } catch (err) {
        toast({
          title: 'Action failed',
          description: err instanceof ApiError ? err.message : 'Unexpected error.',
          tone: 'warning',
        })
        return undefined
      } finally {
        setPending(null)
      }
    },
    [toast],
  )

  return { run, pending }
}
