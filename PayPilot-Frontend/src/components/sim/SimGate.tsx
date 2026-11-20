import { RefreshCw, ServerOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { refreshNow, useSim } from '../../features/sim/store'
import type { Snapshot } from '../../features/sim/types'
import { Button } from '../ui/Button'

/** Renders children with the live snapshot, or a loading / offline state. */
export function SimGate({ children }: { children: (snap: Snapshot) => ReactNode }) {
  const snap = useSim((s) => s.snapshot)
  const connection = useSim((s) => s.connection)
  const error = useSim((s) => s.error)

  if (!snap && connection !== 'offline') {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Loading telemetry">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-card border border-line bg-surface/60" />
        ))}
      </div>
    )
  }

  if (!snap) {
    return (
      <div className="mx-auto max-w-lg rounded-card border border-danger/25 bg-surface p-8 text-center shadow-card">
        <ServerOff className="mx-auto size-8 text-danger" aria-hidden />
        <h2 className="mt-3 text-base font-semibold text-fg">Simulation backend unreachable</h2>
        <p className="mt-2 text-sm text-fg-muted">{error ?? 'No response from /api/v1.'}</p>
        <p className="mt-3 text-xs text-fg-subtle">
          Start it from <code className="readout text-fg-muted">PayPilot/backend</code> with{' '}
          <code className="readout text-fg-muted">uvicorn app.main:app --port 8000</code>.
        </p>
        <Button className="mt-5" leftIcon={RefreshCw} onClick={refreshNow}>
          Retry now
        </Button>
      </div>
    )
  }

  return (
    <>
      {connection === 'offline' && (
        <div role="alert" className="mb-4 rounded-control border border-danger/25 bg-danger/8 px-4 py-2.5 text-xs text-danger">
          Connection to the simulation backend lost — showing the last received values. {error}
        </div>
      )}
      {children(snap)}
    </>
  )
}
