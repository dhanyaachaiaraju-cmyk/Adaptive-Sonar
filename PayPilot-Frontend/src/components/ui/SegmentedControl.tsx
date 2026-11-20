import { cn } from '../../lib/cn'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  /** Optional count shown as a small pill after the label. */
  count?: number
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  size?: 'sm' | 'md'
  className?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'sm',
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-control border border-line bg-surface-sunken p-0.5', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[0.5rem] font-medium transition-[background-color,color] duration-150',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[0.8125rem]',
              active
                ? 'bg-primary/14 text-fg shadow-[inset_0_0_0_1px_rgb(34_195_230/0.35)]'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-2xs leading-4 tabular-nums',
                  active ? 'bg-surface/70 text-fg' : 'bg-surface-hover text-fg-muted',
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
