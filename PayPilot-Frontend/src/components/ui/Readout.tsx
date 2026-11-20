import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface ReadoutProps {
  label: string
  value: ReactNode
  unit?: string
  icon?: LucideIcon
  sub?: ReactNode
  /** Emphasise the primary readings. */
  emphasis?: boolean
  className?: string
}

/** A single instrument reading: label, large monospace value, unit, optional sub-line. */
export function Readout({ label, value, unit, icon: Icon, sub, emphasis, className }: ReadoutProps) {
  return (
    <div className={cn('min-w-0 rounded-control border border-line bg-surface-sunken/60 px-4 py-3', className)}>
      <p className="flex items-center gap-1.5 text-2xs font-medium tracking-[0.06em] text-fg-subtle uppercase">
        {Icon && <Icon className="size-3.5 text-primary/80" aria-hidden />}
        <span className="truncate">{label}</span>
      </p>
      <p className={cn('mt-1.5 flex items-baseline gap-1.5 truncate readout text-fg', emphasis ? 'text-metric' : 'text-xl')}>
        <span className="truncate">{value}</span>
        {unit && <span className="text-xs font-normal text-fg-subtle">{unit}</span>}
      </p>
      {sub && <p className="mt-1 truncate text-2xs text-fg-subtle">{sub}</p>}
    </div>
  )
}

/** Compact key/value row for dense panels. */
export function KV({ k, v, hint }: { k: ReactNode; v: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 last:border-0" title={hint}>
      <dt className="text-xs text-fg-muted">{k}</dt>
      <dd className="readout text-xs text-fg">{v}</dd>
    </div>
  )
}
