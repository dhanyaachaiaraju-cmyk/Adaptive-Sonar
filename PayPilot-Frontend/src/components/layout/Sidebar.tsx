import { FlaskConical, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { ROUTES, type RouteId } from '../../app/routes'
import { useSnapshot } from '../../features/sim/store'
import { cn } from '../../lib/cn'
import { simClock } from '../../lib/format'
import { NavItem } from './NavItem'

export interface SidebarProps {
  route: RouteId
  variant: 'full' | 'rail'
  onNavigate?: () => void
  onToggle?: () => void
  onClose?: () => void
}

const groups = [
  { id: 'operations', label: 'Operations' },
  { id: 'system', label: 'System' },
] as const

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="7" fill="var(--as-surface-raised)" stroke="var(--as-line-strong)" />
      <g fill="none" stroke="var(--as-primary)" strokeWidth="1.4">
        <circle cx="16" cy="16" r="10.5" opacity=".3" />
        <circle cx="16" cy="16" r="6" opacity=".55" />
      </g>
      <path d="M16 16 L24 9.5" stroke="var(--as-primary)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.6" fill="var(--as-primary)" />
    </svg>
  )
}

export function Sidebar({ route, variant, onNavigate, onToggle, onClose }: SidebarProps) {
  const compact = variant === 'rail'
  const snap = useSnapshot()

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'flex h-header shrink-0 items-center border-b border-line',
          compact ? 'justify-center px-3' : 'justify-between gap-2 px-4',
        )}
      >
        <a href="#/overview" onClick={onNavigate} className="flex min-w-0 items-center gap-2.5 rounded-control" aria-label="Adaptive Sonar overview">
          <Mark />
          {!compact && (
            <span className="min-w-0 leading-tight">
              <span className="block text-xs font-semibold tracking-[0.12em] whitespace-nowrap text-fg">ADAPTIVE SONAR</span>
              <span className="block truncate text-2xs text-fg-subtle">Underwater Intelligence &amp; Transmitter Monitoring</span>
            </span>
          )}
        </a>
        {!compact && onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="size-[17px]" aria-hidden />
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            aria-label="Close navigation"
          >
            <X className="size-[17px]" aria-hidden />
          </button>
        )}
      </div>

      <nav aria-label="Main" className={cn('flex-1 overflow-y-auto py-5 scrollbar-thin', compact ? 'px-3' : 'px-4')}>
        {compact && onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="mb-4 flex h-9 w-full items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="size-[17px]" aria-hidden />
          </button>
        )}
        {groups.map((group, index) => (
          <div key={group.id} className={cn(index > 0 && 'mt-6')}>
            {compact ? (
              index > 0 && <div className="mx-2 mb-4 border-t border-line" aria-hidden />
            ) : (
              <p className="mb-2 px-3 text-2xs font-semibold tracking-[0.1em] text-fg-subtle uppercase">{group.label}</p>
            )}
            <ul className="space-y-0.5">
              {ROUTES.filter((item) => item.group === group.id).map((item) => (
                <li key={item.id}>
                  <NavItem route={item} active={item.id === route} compact={compact} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn('shrink-0 border-t border-line', compact ? 'p-3' : 'p-4')}>
        {compact ? (
          <div className="flex justify-center text-warning" title="Simulation mode — no hardware connected">
            <FlaskConical className="size-4" aria-hidden />
          </div>
        ) : (
          <div className="rounded-control border border-warning/20 bg-warning/5 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-2xs font-semibold tracking-[0.08em] text-warning uppercase">
              <FlaskConical className="size-3.5" aria-hidden /> Simulation mode
            </p>
            <p className="mt-1 text-2xs leading-relaxed text-fg-subtle">
              No hardware connected. All readings are model outputs.
            </p>
            {snap && (
              <p className="mt-1.5 readout text-2xs text-fg-muted">
                T+{simClock(snap.status.sim_time_s)} · seed {snap.status.seed}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
