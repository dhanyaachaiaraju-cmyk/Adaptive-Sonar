import type { SimState } from '../../features/sim/types'
import { useSim } from '../../features/sim/store'
import { Badge, type Tone } from '../ui/Badge'

const stateMeta: Record<SimState, { label: string; tone: Tone }> = {
  running: { label: 'Running', tone: 'success' },
  paused: { label: 'Paused', tone: 'warning' },
  standby: { label: 'Standby', tone: 'neutral' },
}

export function StatusPills() {
  const snap = useSim((s) => s.snapshot)
  const connection = useSim((s) => s.connection)

  if (connection === 'offline') {
    return (
      <Badge tone="danger" dot size="sm">
        Backend offline
      </Badge>
    )
  }
  if (!snap) {
    return (
      <Badge tone="neutral" dot pulse size="sm">
        Connecting…
      </Badge>
    )
  }
  const meta = stateMeta[snap.status.state]
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone={meta.tone} dot pulse={snap.status.state === 'running'} size="sm">
        {meta.label}
      </Badge>
      <Badge tone={snap.status.operating_mode === 'adaptive' ? 'primary' : 'warning'} size="sm">
        {snap.status.operating_mode === 'adaptive' ? 'Adaptive mode' : 'Fixed mode'}
      </Badge>
      <Badge tone="neutral" size="sm" className="hidden md:inline-flex">
        Env · {snap.status.environment_mode === 'auto' ? 'auto' : 'manual'}
      </Badge>
    </div>
  )
}
