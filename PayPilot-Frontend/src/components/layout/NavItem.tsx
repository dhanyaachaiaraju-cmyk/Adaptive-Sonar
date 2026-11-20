import type { RouteConfig } from '../../app/routes'
import { cn } from '../../lib/cn'

export interface NavItemProps {
  route: RouteConfig
  active: boolean
  compact?: boolean
  onNavigate?: () => void
}

export function NavItem({ route, active, compact, onNavigate }: NavItemProps) {
  const Icon = route.icon
  return (
    <a
      href={`#/${route.id}`}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={compact ? route.label : undefined}
      aria-label={compact ? route.label : undefined}
      className={cn(
        'group relative flex h-9 items-center rounded-control text-[0.8125rem] font-medium',
        'transition-[background-color,color] duration-150 ease-out-soft',
        compact ? 'justify-center' : 'gap-3 px-3',
        active ? 'bg-primary/10 text-fg' : 'text-fg-muted hover:bg-surface-hover/80 hover:text-fg',
      )}
    >
      {active && (
        <span
          className={cn('absolute top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary', compact ? '-left-3' : '-left-4')}
          aria-hidden
        />
      )}
      <Icon
        className={cn('size-[17px] shrink-0 transition-colors', active ? 'text-primary' : 'text-fg-subtle group-hover:text-fg-muted')}
        aria-hidden
      />
      {!compact && <span className="flex-1 truncate">{route.label}</span>}
    </a>
  )
}
