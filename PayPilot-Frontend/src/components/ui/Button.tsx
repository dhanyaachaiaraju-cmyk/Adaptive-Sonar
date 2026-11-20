import type { LucideIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const base =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium ' +
  'transition-[background-color,border-color,color,box-shadow] duration-150 ease-out-soft ' +
  'disabled:pointer-events-none disabled:opacity-45'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover shadow-glow',
  secondary: 'border border-line-strong bg-surface-raised text-fg hover:border-primary/40 hover:bg-surface-hover',
  outline: 'border border-line-strong text-fg hover:border-primary/50 hover:bg-surface-hover',
  ghost: 'text-fg-muted hover:bg-surface-hover hover:text-fg',
  danger: 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/18',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-3.5 text-[0.8125rem]',
  lg: 'h-10 px-4 text-sm',
  icon: 'size-9',
  'icon-sm': 'size-8',
}

const iconSizes: Record<ButtonSize, string> = {
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-4',
  icon: 'size-[18px]',
  'icon-sm': 'size-4',
}

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  leftIcon?: LucideIcon
  rightIcon?: LucideIcon
}

export function Button({
  variant = 'secondary',
  size = 'md',
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {LeftIcon && <LeftIcon className={iconSizes[size]} aria-hidden />}
      {children}
      {RightIcon && <RightIcon className={iconSizes[size]} aria-hidden />}
    </button>
  )
}
