/**
 * Continuous estimate of SIMULATED time between 2 Hz snapshots, for smooth animation.
 * While running, simulated time advances at `speed` x wall time from the last snapshot
 * (capped at 1.5 s of extrapolation). While paused or in standby it is frozen, so every
 * animation driven by it freezes too.
 */
import { getSimState } from './store'

export function simNow(): number {
  const s = getSimState()
  const snap = s.snapshot
  if (!snap) return 0
  if (snap.status.state !== 'running' || s.lastUpdate == null) return snap.status.sim_time_s
  const dt = Math.min((performance.now() - s.lastUpdatePerf) / 1000, 1.5)
  return snap.status.sim_time_s + dt * snap.status.speed
}
