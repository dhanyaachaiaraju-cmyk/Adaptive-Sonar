import { useEffect, useRef, useState } from 'react'
import { getSimState, subscribeSim } from '../../features/sim/store'
import type { Snapshot } from '../../features/sim/types'
import { num, pulse } from '../../lib/format'
import { QUALITY_PROFILES, getQuality, hasWebGL, prefersReducedMotion } from '../../lib/quality'
import { getSelection, select, subscribeSelection } from '../../lib/ui-store'
import { NeuralWorld, type NodeId } from './NeuralWorld'

const OUTCOME: Record<string, string> = {
  detected: '#46e0ff',
  ambiguous: '#a493ff',
  below_threshold: '#f2b54d',
  blind_zone: '#f26b6b',
}

function nodeValues(s: Snapshot): Partial<Record<NodeId, string>> {
  const e = s.environment
  const tx = s.transmission
  const d = tx.adaptation.decision
  const p = s.primary.last_ping
  return {
    temperature: `${num(e.measured.temperature_c, 2)} °C`,
    salinity: `${num(e.measured.salinity_psu, 2)} PSU`,
    depth: `${num(e.measured.pressure_dbar, 0)} dbar · ${num(e.measured.depth_m, 0)} m`,
    soundspeed: `${num(e.sound_speed_measured_m_s, 1)} m/s`,
    range: d.searching ? `search ${num(d.range_of_interest_m, 0)} m` : `${num(d.range_of_interest_m, 0)} m`,
    echo: p ? `${p.status.replace(/_/g, ' ')} · ${num(p.snr_db, 1)} dB` : 'no ping yet',
    interval: `${num(tx.current.interval_ms, 0)} ms`,
    frequency: `${tx.current.frequency_khz} kHz`,
    search: d.searching ? `ACTIVE · ${d.consecutive_misses} missed` : `monitoring · ${d.consecutive_misses} missed`,
    pulse: pulse(tx.current.pulse_duration_ms),
    waveform: tx.current.waveform === 'LFM' ? `LFM ${num(tx.current.bandwidth_khz, 1)} kHz` : 'CW',
    tx: `#${s.status.ping_count}`,
  }
}

export function NeuralView({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [ok] = useState(hasWebGL)

  useEffect(() => {
    if (!ok || !host.current) return
    const world = new NeuralWorld(host.current, {
      maxDpr: QUALITY_PROFILES[getQuality()].maxDpr,
      reduced: prefersReducedMotion(),
    })
    world.onSelect = (id) => select({ nodeId: id })
    const s0 = getSimState()
    let lastEvent = s0.events.at(-1)?.seq ?? 0
    let lastHist = s0.history.at(-1)?.seq ?? 0
    let lastPing = s0.snapshot?.comparison.systems[0]?.recent_pings.at(-1)?.t ?? -1
    let lastFrame = s0.snapshot?.status.frame ?? 0
    if (s0.snapshot) world.setValues(nodeValues(s0.snapshot))

    const push = () => {
      const s = getSimState()
      const snap = s.snapshot
      if (!snap) return
      if (snap.status.frame < lastFrame) {
        lastEvent = 0
        lastPing = -1
      }
      lastFrame = snap.status.frame
      world.setValues(nodeValues(snap))
      const h = s.history.at(-1)?.seq ?? 0
      if (h > lastHist) world.tickInputs()
      lastHist = h
      for (const p of snap.comparison.systems[0]?.recent_pings ?? []) {
        if (p.t > lastPing) {
          world.transmit(OUTCOME[p.status] ?? '#cfdbe7')
          lastPing = p.t
        }
      }
      for (const ev of s.events) {
        if (ev.seq > lastEvent) {
          world.fire(ev.rule as 'R1', ev.rule_class)
          lastEvent = ev.seq
        }
      }
    }
    const unsub = subscribeSim(push)
    const applySel = () => {
      const sel = getSelection()
      world.selectNode((sel.nodeId as NodeId | null) ?? null)
      const ev = sel.eventSeq != null ? getSimState().events.find((e) => e.seq === sel.eventSeq) : undefined
      world.highlight(ev ? (ev.rule as 'R1') : null, ev?.rule_class)
    }
    applySel()
    const unsubSel = subscribeSelection(applySel)
    return () => {
      unsub()
      unsubSel()
      world.dispose()
    }
  }, [ok])

  if (!ok) {
    return (
      <div className={className}>
        <p className="p-6 text-xs text-warning">WebGL is unavailable — the decision network needs WebGL. Rule cards below remain fully functional.</p>
      </div>
    )
  }
  return <div ref={host} className={className} style={{ position: 'relative' }} />
}
