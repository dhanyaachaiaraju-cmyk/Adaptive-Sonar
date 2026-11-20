import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { getRoute, type RouteId } from '../../app/routes'
import { useLayoutMode } from '../../hooks/useMediaQuery'
import { cn } from '../../lib/cn'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

const COLLAPSE_KEY = 'adaptive-sonar.sidebar-collapsed'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export interface AppShellProps {
  route: RouteId
  children: ReactNode
}

/**
 * Responsive application frame.
 *  - Desktop (≥1280px): full sidebar, user can collapse to an icon rail.
 *  - Tablet (768–1279px): icon rail; the expand button opens the full drawer.
 *  - Mobile (<768px): sidebar hidden; header menu button opens the drawer.
 */
export function AppShell({ route, children }: AppShellProps) {
  const mode = useLayoutMode()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const immersive = route === 'overview'
  const isRail = mode === 'tablet' || (mode === 'desktop' && collapsed)
  const showDrawer = drawerOpen && mode !== 'desktop'

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        /* storage unavailable — keep in-memory state only */
      }
      return next
    })
  }

  // Page-level side effects: document title + scroll position.
  useEffect(() => {
    document.title = `${getRoute(route).label} · Adaptive Sonar`
    window.scrollTo({ top: 0 })
  }, [route])

  // Drawer: Escape to close + lock background scroll.
  useEffect(() => {
    if (!showDrawer) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', handleKey)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = overflow
    }
  }, [showDrawer, closeDrawer])

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main')?.focus()
        }}
        className="sr-only z-[70] rounded-control bg-primary px-4 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {mode !== 'mobile' && (
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 border-r border-hairline bg-[rgba(3,9,18,0.82)] backdrop-blur-xl transition-[width] duration-300 ease-out-soft',
            isRail ? 'w-rail' : 'w-sidebar',
          )}
        >
          <Sidebar
            route={route}
            variant={isRail ? 'rail' : 'full'}
            onToggle={mode === 'desktop' ? toggleCollapsed : () => setDrawerOpen(true)}
          />
        </aside>
      )}

      {showDrawer && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-overlay backdrop-blur-sm" onClick={closeDrawer} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[min(18rem,86vw)] animate-slide-in-left border-r border-line bg-canvas-elevated shadow-elevated">
            <Sidebar route={route} variant="full" onNavigate={closeDrawer} onClose={closeDrawer} />
          </aside>
        </div>
      )}

      <div
        className={cn(
          'flex min-h-dvh flex-col transition-[padding] duration-300 ease-out-soft',
          mode === 'mobile' ? 'pl-0' : isRail ? 'pl-rail' : 'pl-sidebar',
        )}
      >
        <Header route={route} onOpenNavigation={mode === 'mobile' ? () => setDrawerOpen(true) : undefined} />
        <main
          id="main"
          tabIndex={-1}
          className={cn(
            'w-full flex-1 focus:outline-none',
            immersive ? 'relative' : 'mx-auto max-w-[1680px] px-4 py-6 sm:px-6 lg:px-page lg:py-7',
          )}
        >
          <div key={route} className={cn(!immersive && 'animate-rise-in', immersive && 'h-full')}>
            {children}
          </div>
        </main>
        {!immersive && (
          <footer className="mx-auto w-full max-w-[1680px] px-4 pb-6 text-2xs text-fg-subtle sm:px-6 lg:px-page">
            Simulation mode · Values come from published acoustic models (Mackenzie, Saunders, Ainslie–McColm) driven by assumed
            transducer and target parameters, and a heuristic adaptation policy. They are not hardware measurements and do not
            establish real-world sonar performance.
          </footer>
        )}
      </div>
    </div>
  )
}
