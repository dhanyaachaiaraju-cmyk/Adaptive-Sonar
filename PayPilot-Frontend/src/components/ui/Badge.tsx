import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** Status tones carry meaning; the label text always carries it too, never colour alone. */
export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

const tones: Record<Tone, string> = {
  neutral: 'bg-fg-subtle/12 text-fg-muted ring-fg-subtle/25',
  primary: 'bg-primary/12 text-primary-soft ring-primary/30',
  success: 'bg-success/10 text-success ring-success/25',
  warning: 'bg-warning/10 text-warning ring-warning/25',
  danger: 'bg-danger/10 text-danger ring-danger/25',
  info: 'bg-info/10 text-info ring-info/25',
}

const dots: Record<Tone, string> = {
  neutral: 'bg-fg-subtle',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
}

export interface BadgeProps {
  tone?: Tone
  dot?: boolean
  /** Pulse the dot (live / active states). */
  pulse?: boolean
  size?: 'sm' | 'md'
  className?: string
  children: ReactNode
}

export function Badge({ tone = 'neutral', dot, pulse, size = 'md', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset',
        size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs',
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cn('size-1.5 rounded-full', dots[tone], pulse && 'animate-pulse-soft')} aria-hidden />}
      {children}
    </span>
  )
}
