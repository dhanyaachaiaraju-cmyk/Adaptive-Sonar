import { useSyncExternalStore } from 'react'
import { DEFAULT_ROUTE, isRouteId, type RouteId } from './routes'

/**
 * Minimal hash router — enough for a frontend-only milestone without
 * adding a routing dependency. URLs look like `/#/invoices`, so deep links
 * and the browser back button work.
 *
 * An optional second segment carries a page-specific parameter, e.g.
 * `#/invoices/inv-2047` (open an invoice) or `#/invoices/new`.
 */
function segments(): string[] {
  return window.location.hash.replace(/^#\/?/, '').split('?')[0].split('/')
}

function readRoute(): RouteId {
  const value = segments()[0]
  return isRouteId(value) ? value : DEFAULT_ROUTE
}

function readParam(): string | null {
  const [route, param] = segments()
  if (!isRouteId(route) || !param) return null
  try {
    return decodeURIComponent(param)
  } catch {
    return null
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function navigate(route: RouteId, param?: string) {
  const next = `#/${route}${param ? `/${encodeURIComponent(param)}` : ''}`
  if (window.location.hash !== next) window.location.hash = next
}

export function useRoute(): RouteId {
  return useSyncExternalStore(subscribe, readRoute, () => DEFAULT_ROUTE)
}

/** The optional second URL segment for the current route, or null. */
export function useRouteParam(): string | null {
  return useSyncExternalStore(subscribe, readParam, () => null)
}
