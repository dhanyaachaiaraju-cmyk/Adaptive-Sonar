import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { ToastContext, type ToastInput, type ToastTone } from './toast-context'

interface ToastItem extends Required<Pick<ToastInput, 'title' | 'tone'>> {
  id: number
  description?: string
}

const toneStyles: Record<ToastTone, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: 'text-info' },
  success: { icon: CheckCircle2, className: 'text-success' },
  warning: { icon: TriangleAlert, className: 'text-warning' },
}

const DURATION_MS = 4500

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const toast = useCallback(
    ({ title, description, tone = 'info' }: ToastInput) => {
      const id = ++nextId.current
      setToasts((current) => [...current.slice(-2), { id, title, description, tone }])
      window.setTimeout(() => dismiss(id), DURATION_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
      >
        {toasts.map((item) => {
          const { icon: Icon, className } = toneStyles[item.tone]
          return (
            <div
              key={item.id}
              className="glass pointer-events-auto relative flex w-full max-w-sm animate-toast-in items-start gap-3 overflow-hidden rounded-card border border-line-strong p-4 shadow-elevated"
            >
              <span
                className="pointer-events-none absolute inset-x-4 top-0 h-px bg-primary opacity-50"
                aria-hidden
              />
              <Icon className={cn('mt-0.5 size-[18px] shrink-0', className)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{item.title}</p>
                {item.description && <p className="mt-0.5 text-xs text-fg-muted">{item.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="-m-1 rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                aria-label="Dismiss notification"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
