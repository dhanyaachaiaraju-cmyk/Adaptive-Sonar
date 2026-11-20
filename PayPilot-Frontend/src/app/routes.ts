import type { LucideIcon } from 'lucide-react'
import { BrainCircuit, Cpu, Globe2, Info, LineChart, Radar, ScrollText, Waves } from 'lucide-react'

export type RouteId = 'overview' | 'environment' | 'transmission' | 'sonar' | 'analytics' | 'logs' | 'hardware' | 'about'

export interface RouteConfig {
  id: RouteId
  label: string
  icon: LucideIcon
  /** Short context line shown under the page title in the header. */
  context: string
  group: 'operations' | 'system'
}

export const ROUTES: RouteConfig[] = [
  { id: 'overview', label: 'Command', icon: Globe2, context: 'Underwater command environment · live digital twin', group: 'operations' },
  {
    id: 'environment',
    label: 'Ocean Simulator',
    icon: Waves,
    context: 'Control laboratory for the simulated water column',
    group: 'operations',
  },
  {
    id: 'transmission',
    label: 'Adaptive Intelligence',
    icon: BrainCircuit,
    context: 'Rules R1–R6, their decisions and the reasoning behind each change',
    group: 'operations',
  },
  {
    id: 'sonar',
    label: 'Sonar Lab',
    icon: Radar,
    context: 'Scanning, transmit waveform, received echo, range and timing',
    group: 'operations',
  },
  { id: 'analytics', label: 'Performance', icon: LineChart, context: 'Adaptive vs fixed settings · seeded benchmark · telemetry history', group: 'operations' },
  { id: 'logs', label: 'System Logs', icon: ScrollText, context: 'Timestamped simulation and adaptation events', group: 'operations' },
  { id: 'hardware', label: 'Hardware Integration', icon: Cpu, context: 'Planned STM32 telemetry link (placeholder)', group: 'system' },
  { id: 'about', label: 'About', icon: Info, context: 'Models, assumptions and limitations', group: 'system' },
]

export const DEFAULT_ROUTE: RouteId = 'overview'

const routeIds = new Set<string>(ROUTES.map((route) => route.id))

export function isRouteId(value: string): value is RouteId {
  return routeIds.has(value)
}

export function getRoute(id: RouteId): RouteConfig {
  return ROUTES.find((route) => route.id === id) ?? ROUTES[0]
}
