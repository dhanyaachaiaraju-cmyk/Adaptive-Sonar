import { lazy, Suspense } from 'react'
import type { RouteId } from '../app/routes'

// Heavy pages (WebGL scenes, canvas instruments) load on demand so the shell paints fast.
const CommandPage = lazy(() => import('./CommandPage').then((m) => ({ default: m.CommandPage })))
const OceanPage = lazy(() => import('./OceanPage').then((m) => ({ default: m.OceanPage })))
const IntelligencePage = lazy(() => import('./IntelligencePage').then((m) => ({ default: m.IntelligencePage })))
const SonarLabPage = lazy(() => import('./SonarLabPage').then((m) => ({ default: m.SonarLabPage })))
const PerformancePage = lazy(() => import('./PerformancePage').then((m) => ({ default: m.PerformancePage })))
const LogsPage = lazy(() => import('./LogsPage').then((m) => ({ default: m.LogsPage })))
const HardwarePage = lazy(() => import('./HardwarePage').then((m) => ({ default: m.HardwarePage })))
const AboutPage = lazy(() => import('./AboutPage').then((m) => ({ default: m.AboutPage })))

function Loading() {
  return (
    <div className="grid min-h-[50vh] place-items-center" aria-busy="true">
      <div className="flex items-center gap-3 label-tech">
        <span className="size-2 animate-pulse-soft rounded-full bg-acoustic" /> Initialising instruments
      </div>
    </div>
  )
}

export function PageRenderer({ route }: { route: RouteId }) {
  const Page = {
    overview: CommandPage,
    environment: OceanPage,
    transmission: IntelligencePage,
    sonar: SonarLabPage,
    analytics: PerformancePage,
    logs: LogsPage,
    hardware: HardwarePage,
    about: AboutPage,
  }[route]
  return (
    <Suspense fallback={<Loading />}>
      <Page />
    </Suspense>
  )
}
