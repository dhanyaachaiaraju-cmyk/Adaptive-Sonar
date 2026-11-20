import { Menu } from 'lucide-react'
import { getRoute, type RouteId } from '../../app/routes'
import { SimControls } from '../sim/SimControls'
import { StatusPills } from '../sim/StatusPills'
import { Button } from '../ui/Button'

export interface HeaderProps {
  route: RouteId
  onOpenNavigation?: () => void
}

export function Header({ route, onOpenNavigation }: HeaderProps) {
  const config = getRoute(route)

  return (
    <header className="glass sticky top-0 z-30 border-b border-line">
      <div className="mx-auto flex min-h-header max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6 lg:px-page">
        {onOpenNavigation && (
          <Button variant="ghost" size="icon" onClick={onOpenNavigation} aria-label="Open navigation" className="-ml-2">
            <Menu className="size-5" aria-hidden />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="truncate text-base font-semibold tracking-tight text-fg sm:text-lg">{config.label}</h1>
            <StatusPills />
          </div>
          <p className="hidden truncate text-xs text-fg-subtle sm:block">{config.context}</p>
        </div>
        <SimControls compact={!!onOpenNavigation} />
      </div>
    </header>
  )
}
