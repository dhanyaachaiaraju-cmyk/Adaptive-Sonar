import { ChevronDown, FlaskConical, X } from 'lucide-react'
import { useState } from 'react'
import { AdaptationTimeline, EventInspector } from '../components/charts/AdaptationTimeline'
import { FrequencyAnalysis } from '../components/charts/FrequencyAnalysis'
import { LiveScope } from '../components/charts/LiveScope'
import { DataTag, Instrument, SectionTitle } from '../components/instruments/primitives'
import { SimGate } from '../components/sim/SimGate'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { CLASS_STYLE, RULES, type RuleInfo } from '../features/sim/rules'
import { simApi } from '../features/sim/simApi'
import { useSim } from '../features/sim/store'
import type { Snapshot } from '../features/sim/types'
import { useSimAction } from '../features/sim/useSimAction'
import { cn } from '../lib/cn'
import { eventValue, num, pulse, simClock } from '../lib/format'
import { select, useSelection } from '../lib/ui-store'
import { NODES, RULE_TARGET, type NodeId } from '../three/neural/NeuralWorld'
import { NeuralView } from '../three/neural/NeuralView'
import { ConfigPanel, SettingsTable } from './TransmissionPage'

export function IntelligencePage() {
  return <SimGate>{(snap) => <Intelligence snap={snap} />}</SimGate>
}

function Intelligence({ snap }: { snap: Snapshot }) {
  const { run } = useSimAction()
  const tx = snap.transmission
  const selEvent = useSelection((s) => s.eventSeq)
  const events = useSim((s) => s.events)
  const ev = events.find((e) => e.seq === selEvent)

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Neural sonar · decision engine" title="How the transmitter decides">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-tech">status · <span className="text-intel">{tx.adaptation.status}</span></span>
          <SegmentedControl
            label="Operating mode"
            size="md"
            value={tx.operating_mode}
            onChange={(mode) => run('mode', () => simApi.setTransmissionMode(mode), mode === 'fixed' ? 'Locked to Fixed A settings' : 'Adaptation enabled')}
            options={[
              { value: 'adaptive', label: 'Adaptive' },
              { value: 'fixed', label: 'Fixed' },
            ]}
          />
        </div>
      </SectionTitle>

      <div role="note" className="flex gap-3 rounded-card border border-warning/25 bg-warning/[0.04] px-4 py-3 text-xs leading-relaxed text-fg-muted">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p>
          <span className="font-medium text-warning">Rule-based, not machine learning.</span> The network is a visual metaphor: nodes are the controller's real
          inputs and settings, edges are the data each rule actually reads. Pathways light only when the backend reports a real event. Physics terms use
          published models; preferences and thresholds are hand-chosen and not validated.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-panel border border-hairline bg-[radial-gradient(60rem_30rem_at_50%_40%,rgba(138,118,240,0.08),transparent_70%),#02070f]">
        <NeuralView className="h-[560px] w-full" />
        <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-3 rounded-control holo px-3 py-2 text-2xs text-fg-muted">
          <span><span className="mr-1 inline-block size-2 rounded-full bg-env" />inputs</span>
          <span><span className="mr-1 inline-block size-2 rounded-full bg-acoustic" />analysis</span>
          <span><span className="mr-1 inline-block size-2 rounded-full bg-intel" />settings</span>
          <span>packets = a real rule firing or a real transmission · click a node to inspect</span>
        </div>
        <NodeInspector snap={snap} />
        {ev && (
          <div className="absolute right-3 bottom-3 left-3 max-h-[46%] overflow-y-auto lg:left-auto lg:w-[480px]">
            <EventInspector ev={ev} compact />
          </div>
        )}
      </div>

      <section className="space-y-3">
        <SectionTitle eyebrow="R1 – R6" title="The six rules, live" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {RULES.map((r) => (
            <RuleCard key={r.id} rule={r} />
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Instrument title="Frequency analysis (R3)" tag="calculated" explain="Every candidate the controller evaluated on the latest ping, with the sonar-equation terms it used.">
          <FrequencyAnalysis snap={snap} />
        </Instrument>
        <PulseDecision snap={snap} />
      </div>

      <Instrument title="Adaptation timeline" tag="simulated" explain="Every R1–R6 event in this run. Select one to highlight its pathway above and its marker on the charts below.">
        <AdaptationTimeline />
      </Instrument>

      <div className="grid gap-5 xl:grid-cols-2">
        <Instrument title="Frequency & pulse history" tag="simulated" explain="Step traces of the transmitted settings; diamonds mark the rule events that changed them.">
          <LiveScope series={[{ key: 'frequency_khz', label: 'Frequency', color: 'acoustic' }]} unit="kHz" digits={0} step eventRules={['R3']} height={150} ariaLabel="Frequency history" />
          <div className="mt-3">
            <LiveScope series={[{ key: 'pulse_duration_ms', label: 'Pulse', color: 'intel' }]} unit="ms" digits={2} step eventRules={['R4', 'R5']} height={150} ariaLabel="Pulse duration history" />
          </div>
          <div className="mt-3">
            <LiveScope series={[{ key: 'interval_ms', label: 'Interval', color: 'ref' }]} unit="ms" digits={0} step eventRules={['R2', 'R6']} height={140} ariaLabel="Interval history" />
          </div>
        </Instrument>
        <div className="space-y-5">
          <Instrument title="Previous vs current transmission" tag="simulated">
            <SettingsTable current={tx.current} previous={tx.previous} />
          </Instrument>
          <ConfigPanel />
        </div>
      </div>
    </div>
  )
}

function RuleCard({ rule }: { rule: RuleInfo }) {
  const events = useSim((s) => s.events)
  const pingNow = useSim((s) => s.snapshot?.status.ping_count ?? 0)
  const selSeq = useSelection((s) => s.eventSeq)
  const [open, setOpen] = useState(false)
  const mine = events.filter((e) => e.rule === rule.id)
  const last = mine.at(-1)
  const cls = CLASS_STYLE[rule.cls]
  const recent = last && pingNow - last.ping <= 3
  const isSel = last && selSeq != null && mine.some((e) => e.seq === selSeq)
  return (
    <article
      className={cn('rounded-card holo p-4 transition-shadow', recent && 'shadow-[0_0_0_1px_rgba(164,147,255,0.45),0_12px_40px_-18px_rgba(164,147,255,0.6)]', isSel && 'ring-1 ring-intel/60')}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2">
            <span className="readout text-lg font-semibold" style={{ color: cls.color }}>
              {rule.id}
            </span>
            <span className="rounded-full border px-1.5 py-px label-tech" style={{ color: cls.color, borderColor: `${cls.color}55` }}>
              {cls.label}
            </span>
          </p>
          <h3 className="mt-1 font-display text-base font-semibold tracking-tight text-fg">{rule.title}</h3>
        </div>
        <span className={cn('label-tech', recent ? 'text-intel' : 'text-fg-subtle')}>{recent ? 'just fired' : last ? 'monitoring' : 'idle · not triggered yet'}</span>
      </header>
      <p className="mt-2 text-xs leading-relaxed text-fg-muted">{rule.plain}</p>
      <div className="mt-3 rounded-control border border-hairline bg-surface-sunken/50 p-2.5">
        {last ? (
          <button type="button" onClick={() => select({ eventSeq: last.seq })} className="block w-full text-left">
            <p className="flex items-center gap-2 readout text-sm">
              <span className="text-fg-subtle">{eventValue(last.previous, last.unit)}</span>
              <span className="text-intel">→</span>
              <span className="text-fg">{eventValue(last.new, last.unit)}</span>
              <span className="ml-auto text-3xs text-fg-subtle">T+{simClock(last.sim_time_s).slice(0, 8)}</span>
            </p>
            <p className="mt-1 line-clamp-2 text-2xs text-fg-subtle">{last.reason}</p>
          </button>
        ) : (
          <p className="text-2xs text-fg-subtle">No change yet. Watching: {rule.trigger}</p>
        )}
      </div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-2xs text-fg-subtle hover:text-fg" aria-expanded={open}>
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} aria-hidden /> Technical details · {mine.length} events
      </button>
      {open && (
        <dl className="mt-2 space-y-2 text-2xs">
          <div>
            <dt className="label-tech">Changes</dt>
            <dd className="text-fg-muted">{rule.changes}</dd>
          </div>
          <div>
            <dt className="label-tech">Trigger condition</dt>
            <dd className="text-fg-muted">{rule.trigger}</dd>
          </div>
          <div>
            <dt className="label-tech">Inputs</dt>
            <dd className="text-fg-muted">{rule.inputs.join(' · ')}</dd>
          </div>
          {last && (
            <div>
              <dt className="label-tech">Last trigger</dt>
              <dd className="readout text-fg-muted">{last.trigger}</dd>
            </div>
          )}
          <div>
            <dt className="label-tech">Limitations</dt>
            <dd className="text-fg-muted">{rule.limitations.join(' ')}</dd>
          </div>
        </dl>
      )}
    </article>
  )
}

function PulseDecision({ snap }: { snap: Snapshot }) {
  const d = snap.transmission.adaptation.decision
  const tx = snap.transmission
  const cur = d.candidates.find((c) => c.frequency_khz === tx.current.frequency_khz)
  const cap = d.pulse_cap_ms
  const need = cur?.pulse_needed_ms ?? null
  const lo = Math.log10(0.1)
  const hi = Math.log10(Math.max(100, cap * 2))
  const x = (ms: number) => `${Math.min(100, Math.max(0, ((Math.log10(Math.max(ms, 0.1)) - lo) / (hi - lo)) * 100))}%`
  return (
    <Instrument title="Pulse-duration decision (R4 / R5)" tag="calculated" explain="Where the pulse sits between its limits, on a log scale.">
      <div className="relative mt-2 h-16">
        <div className="absolute inset-x-0 top-7 h-1 rounded-full bg-line-strong" />
        <div className="absolute top-6 h-3 rounded-sm bg-intel/15" style={{ left: x(0.2), width: `calc(${x(cap)} - ${x(0.2)})` }} title="Allowed range" />
        <div className="absolute top-4 h-7 w-px bg-warning" style={{ left: x(cap) }} />
        <span className="absolute top-0 -translate-x-1/2 readout text-3xs text-warning" style={{ left: x(cap) }}>
          cap {pulse(cap)}
        </span>
        <div className="absolute top-4 h-7 w-px bg-intel/60" style={{ left: x(2) }} />
        <span className="absolute top-12 -translate-x-1/2 readout text-3xs text-intel" style={{ left: x(2) }}>
          LFM ≥ 2 ms
        </span>
        {need != null && (
          <div className="absolute top-5 size-2.5 -translate-x-1/2 rotate-45 border border-env" style={{ left: x(need) }} title={`needed ${pulse(need)}`} />
        )}
        <div className="absolute top-4 size-0 -translate-x-1/2 border-x-[6px] border-t-[8px] border-x-transparent border-t-acoustic drop-shadow-[0_0_6px_#46e0ff] transition-[left] duration-500" style={{ left: x(tx.current.pulse_duration_ms) }} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 readout text-2xs">
        <dt className="text-fg-subtle">Current pulse</dt>
        <dd className="text-right text-acoustic">{pulse(tx.current.pulse_duration_ms)} {tx.current.waveform}</dd>
        <dt className="text-fg-subtle">Needed for +6 dB margin</dt>
        <dd className="text-right text-env">{need == null ? '—' : need > 1000 ? '> 1 s' : pulse(need)}</dd>
        <dt className="text-fg-subtle">Cap</dt>
        <dd className="text-right text-warning">{pulse(cap)}</dd>
        <dt className="text-fg-subtle">Cap set by</dt>
        <dd className="text-right font-sans text-fg-muted">{d.pulse_cap_reason || '—'}</dd>
        <dt className="text-fg-subtle">Predicted margin</dt>
        <dd className="text-right text-fg">{d.predicted_margin_db == null ? '—' : `${num(d.predicted_margin_db, 1)} dB`}</dd>
        <dt className="text-fg-subtle">Measured E/N0</dt>
        <dd className="text-right text-fg">{d.measured_snr_db == null ? '—' : `${num(d.measured_snr_db, 1)} dB`}</dd>
        <dt className="text-fg-subtle">Calibration (≈ TS)</dt>
        <dd className="text-right text-fg">{d.calibration_offset_db == null ? 'prior' : `${num(d.calibration_offset_db, 1)} dB`}</dd>
        <dt className="text-fg-subtle">Blind zone</dt>
        <dd className="text-right text-fg">{num(tx.derived.blind_range_m, 2)} m</dd>
      </dl>
      <p className="mt-2 flex items-center gap-2 text-2xs text-fg-subtle">
        <DataTag kind="calculated" /> E/N0 grows by 10·log(τ₂/τ₁): doubling the pulse adds 3 dB. Energy metric is SL + 10 log τ, not electrical power.
      </p>
    </Instrument>
  )
}

const NODE_DETAIL: Record<NodeId, { what: string; calc: string; limits: string }> = {
  temperature: { what: 'Simulated CTD temperature at the vehicle.', calc: 'Truth + Gaussian noise σ 0.01 °C.', limits: 'Assumed sensor accuracy; one point measurement.' },
  salinity: { what: 'Simulated salinity at the vehicle.', calc: 'Truth + Gaussian noise σ 0.01 PSU.', limits: 'Real salinity is derived from conductivity; not modelled.' },
  depth: { what: 'Measured pressure and the depth derived from it.', calc: 'Saunders (1981) pressure → depth.', limits: 'Pressure noise σ 0.05 dbar (assumed).' },
  soundspeed: { what: 'Sound speed used to convert echo time to range (R1).', calc: 'Mackenzie (1981) from measured T, S, D.', limits: 'Vehicle-depth value applied to the whole path.' },
  range: { what: 'Range of interest used for planning.', calc: 'Smoothed range of unambiguous echoes, or the search range when searching.', limits: 'Tracks only the primary contact.' },
  echo: { what: 'Outcome of the latest ping and the calibration it provides.', calc: 'E/N0 vs 10 dB threshold; offset = measured − predicted (TS = 0).', limits: 'Noise-limited model; no reverberation or false alarms.' },
  interval: { what: 'Time between transmissions (R2/R6).', calc: '≥ 1.1 × two-way time to 1.6 × range + pulse.', limits: 'Hand-chosen window and guard factors.' },
  frequency: { what: 'Carrier frequency (R3).', calc: 'Highest candidate whose predicted E/N0 reaches 16 dB within the pulse cap.', limits: 'Prediction shares the simulator model (optimistic).' },
  search: { what: 'Search plan (R6).', calc: 'Active after 4 pings without a valid echo; plans for 1500 m.', limits: 'Fixed search range; no bearing search.' },
  pulse: { what: 'Pulse duration (R4).', calc: 'τ needed = τ·10^((16 − predicted)/10), within [0.2 ms, cap].', limits: 'Margins hand-chosen.' },
  waveform: { what: 'CW or LFM chirp (R5).', calc: 'LFM when τ ≥ 2 ms, bandwidth 30 % of f.', limits: 'Doppler not modelled.' },
  tx: { what: 'Each simulated transmission.', calc: 'Fires on the adaptive interval; outcome colours the feedback edge.', limits: 'Simulated; no hardware.' },
}

function NodeInspector({ snap }: { snap: Snapshot }) {
  const nodeId = useSelection((s) => s.nodeId) as NodeId | null
  if (!nodeId) return null
  const n = NODES.find((x) => x.id === nodeId)
  const det = NODE_DETAIL[nodeId]
  const rules = (Object.entries(RULE_TARGET) as [string, NodeId][]).filter(([, t]) => t === nodeId).map(([r]) => r)
  const e = snap.environment
  const tx = snap.transmission
  const d = tx.adaptation.decision
  const values: Record<NodeId, string> = {
    temperature: `${num(e.measured.temperature_c, 3)} °C (truth ${num(e.truth.temperature_c, 3)})`,
    salinity: `${num(e.measured.salinity_psu, 3)} PSU (truth ${num(e.truth.salinity_psu, 3)})`,
    depth: `${num(e.measured.pressure_dbar, 2)} dbar → ${num(e.measured.depth_m, 2)} m`,
    soundspeed: `${num(e.sound_speed_measured_m_s, 2)} m/s (truth ${num(e.sound_speed_m_s, 2)})`,
    range: `${num(d.range_of_interest_m, 1)} m${d.searching ? ' (search)' : ''} · window ${num(d.window_m, 0)} m`,
    echo: snap.primary.last_ping ? `${snap.primary.last_ping.status} · ${num(snap.primary.last_ping.snr_db, 1)} dB · offset ${num(d.calibration_offset_db, 1)} dB` : 'no ping',
    interval: `${num(tx.current.interval_ms, 0)} ms (required ${num(d.required_interval_ms, 0)} ms)`,
    frequency: `${tx.current.frequency_khz} kHz · DI ${num(tx.derived.directivity_index_db, 1)} dB · beam ${num(tx.derived.beamwidth_deg, 1)}°`,
    search: d.searching ? `active · ${d.consecutive_misses} missed` : `monitoring · ${d.consecutive_misses} missed`,
    pulse: `${pulse(tx.current.pulse_duration_ms)} · cap ${pulse(d.pulse_cap_ms)}`,
    waveform: tx.current.waveform === 'LFM' ? `LFM · ${num(tx.current.bandwidth_khz, 2)} kHz` : `CW · ${num(tx.current.bandwidth_khz, 2)} kHz (1/τ)`,
    tx: `ping #${snap.status.ping_count} · ${num(tx.derived.ping_rate_hz, 2)} Hz`,
  }
  return (
    <aside className="absolute top-16 right-3 w-72 animate-rise-in rounded-card holo-strong p-4 text-xs">
      <div className="flex items-start justify-between">
        <div>
          <p className="label-tech text-intel">Node inspection</p>
          <h3 className="font-display text-lg font-semibold text-fg">{n?.label}</h3>
        </div>
        <button type="button" onClick={() => select({ nodeId: null })} className="rounded p-1 text-fg-subtle hover:text-fg" aria-label="Close node">
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 readout text-sm text-fg">{values[nodeId]}</p>
      <dl className="mt-3 space-y-2 text-2xs">
        <div>
          <dt className="label-tech">What it is</dt>
          <dd className="text-fg-muted">{det.what}</dd>
        </div>
        <div>
          <dt className="label-tech">Calculation</dt>
          <dd className="text-fg-muted">{det.calc}</dd>
        </div>
        {rules.length > 0 && (
          <div>
            <dt className="label-tech">Set by</dt>
            <dd className="text-fg-muted">{rules.join(', ')}</dd>
          </div>
        )}
        <div>
          <dt className="label-tech">Limitations</dt>
          <dd className="text-fg-muted">{det.limits}</dd>
        </div>
      </dl>
    </aside>
  )
}
