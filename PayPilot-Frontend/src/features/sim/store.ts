/**
 * Live simulation store.
 *
 * Polls GET /simulation/live with incremental cursors, keeps bounded client-side
 * buffers (history, logs, adaptation events) and exposes them through
 * useSyncExternalStore. Components never generate data themselves; everything
 * shown comes from the backend simulation engine.
 */
import { useSyncExternalStore } from 'react'
import { ApiError } from '../../lib/api'
import { simApi } from './simApi'
import type { AdaptationEvent, HistorySample, LiveResponse, LogEntry, Snapshot } from './types'

const MAX_HISTORY = 1200
const MAX_LOGS = 2000
const MAX_EVENTS = 500
const POLL_RUNNING_MS = 500
const POLL_IDLE_MS = 1200
const POLL_ERROR_MS = 2500

export type Connection = 'connecting' | 'online' | 'offline'

export interface SimStoreState {
  connection: Connection
  error: string | null
  lastUpdate: number | null
  /** performance.now() at the last snapshot, for smooth sim-time extrapolation. */
  lastUpdatePerf: number
  snapshot: Snapshot | null
  history: HistorySample[]
  logs: LogEntry[]
  events: AdaptationEvent[]
}

let state: SimStoreState = {
  connection: 'connecting',
  error: null,
  lastUpdate: null,
  lastUpdatePerf: 0,
  snapshot: null,
  history: [],
  logs: [],
  events: [],
}

const listeners = new Set<() => void>()
let timer: number | undefined
let inflight: AbortController | null = null
let failures = 0
let generation = 0

function set(next: Partial<SimStoreState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

function append<T>(current: T[], incoming: T[], max: number): T[] {
  if (!incoming.length) return current
  const merged = current.concat(incoming)
  return merged.length > max ? merged.slice(merged.length - max) : merged
}

function merge(res: LiveResponse) {
  const { history, logs, adaptation_events, reset_detected, ...snapshot } = res
  const reset = reset_detected || (state.snapshot && res.status.frame < state.snapshot.status.frame)
  set({
    connection: 'online',
    error: null,
    lastUpdate: Date.now(),
    lastUpdatePerf: performance.now(),
    snapshot,
    history: reset ? history : append(state.history, history, MAX_HISTORY),
    logs: reset ? logs : append(state.logs, logs, MAX_LOGS),
    events: reset ? adaptation_events : append(state.events, adaptation_events, MAX_EVENTS),
  })
}

async function poll() {
  window.clearTimeout(timer)
  const gen = ++generation
  inflight?.abort()
  inflight = new AbortController()
  const cursors = state.snapshot
    ? {
        history: state.history.at(-1)?.seq ?? 0,
        logs: state.logs.at(-1)?.seq ?? 0,
        events: state.events.at(-1)?.seq ?? 0,
      }
    : {}
  let delay: number
  try {
    const res = await simApi.live(cursors, inflight.signal)
    if (gen !== generation) return
    failures = 0
    merge(res)
    delay = res.status.state === 'running' ? POLL_RUNNING_MS : POLL_IDLE_MS
  } catch (err) {
    if (gen !== generation) return
    failures += 1
    delay = POLL_ERROR_MS
    const message = err instanceof ApiError ? err.message : 'Unexpected error while reading telemetry.'
    set({ connection: failures >= 2 || !state.snapshot ? 'offline' : state.connection, error: message })
  }
  if (listeners.size > 0) timer = window.setTimeout(poll, delay)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) void poll()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.clearTimeout(timer)
      inflight?.abort()
    }
  }
}

/** Imperative access for render loops (no React re-render). */
export function getSimState(): SimStoreState {
  return state
}

/** Imperative subscription for renderers; also keeps polling alive. */
export const subscribeSim = subscribe

/** Force an immediate refresh (after a control action). */
export function refreshNow() {
  void poll()
}

export function useSim<T>(selector: (s: SimStoreState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  )
}

export function useSnapshot(): Snapshot | null {
  return useSim((s) => s.snapshot)
}
