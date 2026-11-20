import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type CardPadding = 'none' | 'sm' | 'md' | 'lg'

const paddings: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
}

export interface CardProps extends ComponentProps<'div'> {
  padding?: CardPadding
}

export function Card({ padding = 'md', className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'holo relative rounded-card',
        paddings[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export interface PanelProps extends Omit<ComponentProps<'section'>, 'title'> {
  title: ReactNode
  /** Small uppercase label above the title. */
  eyebrow?: ReactNode
  description?: ReactNode
  action?: ReactNode
  bodyClassName?: string
}

/** A titled instrument panel. */
export function Panel({ title, eyebrow, description, action, className, bodyClassName, children, ...props }: PanelProps) {
  return (
    <section
      className={cn('holo flex flex-col rounded-card', className)}
      {...props}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-hairline px-5 py-3.5">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-0.5 label-tech text-acoustic/80">{eyebrow}</p>
          )}
          <h2 className="font-display text-[0.9375rem] font-semibold tracking-tight text-fg">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-fg-subtle">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </header>
      <div className={cn('flex-1 p-5', bodyClassName)}>{children}</div>
    </section>
  )
}
