import { FlaskConical, RotateCcw, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ComparisonTable } from '../components/sim/ComparisonTable'
import { SimGate } from '../components/sim/SimGate'
import { Badge, type Tone } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Panel } from '../components/ui/Card'
import { KV } from '../components/ui/Readout'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { simApi } from '../features/sim/simApi'
import { useSim } from '../features/sim/store'
import type { AdaptationConfig, AdaptationEvent, Snapshot, TxSettings } from '../features/sim/types'
import { useSimAction } from '../features/sim/useSimAction'
import { cn } from '../lib/cn'
import { eventValue, num, percent, pulse, simClock, wallClock } from '../lib/format'

const statusTone: Record<string, Tone> = { stable: 'success', adapting: 'primary', searching: 'warning', disabled: 'neutral' }

const RULES: [string, string, 'physics' | 'constraint' | 'heuristic' | 'physics + heuristic', string][] = [
  ['R1', 'Sound-speed reference', 'physics', 'Every echo is converted with the sound speed computed (Mackenzie) from the latest measured T, S and depth. An event is logged when it drifts by more than the logging threshold.'],
  ['R2', 'Listening window', 'constraint', 'Interval ≥ guard × two-way travel time to the window range (window factor × tracked range) plus the pulse, so the echo returns before the next transmission.'],
  ['R3', 'Frequency', 'heuristic', 'Calibrated sonar-equation prediction for every candidate frequency (absorption, noise and directivity all depend on f). Policy: the highest frequency that reaches the target margin within the pulse cap, with hysteresis before stepping up.'],
  ['R4', 'Pulse duration', 'physics + heuristic', 'Pulse set to the length predicted to reach the target margin (E/N0 grows with 10 log τ), capped by blind-zone and duty-cycle limits. The target and upper margins are policy choices.'],
  ['R5', 'Waveform', 'heuristic', 'Pulses at or above the LFM threshold use a chirp so range resolution is set by bandwidth (c/2B) rather than pulse length. Detection energy is the same.'],
  ['R6', 'Echo-loss search', 'heuristic', 'After N consecutive pings without a valid echo, plan the window and pulse for the search range.'],
]

const classTone: Record<string, Tone> = {
  physics: 'success',
  constraint: 'info',
  heuristic: 'warning',
  'physics + heuristic': 'primary',
}

export function TransmissionPage() {
  return <SimGate>{(snap) => <Transmission snap={snap} />}</SimGate>
}

function Transmission({ snap }: { snap: Snapshot }) {
  const { run } = useSimAction()
  const tx = snap.transmission
  const d = tx.adaptation.decision

  return (
    <div className="space-y-5">
      <div
        role="note"
        className="flex gap-3 rounded-card border border-warning/25 bg-warning/5 px-4 py-3 text-xs leading-relaxed text-fg-muted"
      >
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p>
          <span className="font-medium text-warning">Demonstration algorithm.</span> The adaptation rules below are a
          configurable illustration of textbook trade-offs. Physics terms use published models; the preferences and
          thresholds are hand-chosen and not validated. In the seeded benchmark an energy-matched fixed setting detects about
          as well as the adaptive transmitter; adaptation mainly changes update rate, energy and resolution. None of this is
          evidence of real-world performance.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel
          eyebrow="Transmitter"
          title="Current and previous settings"
          action={
            <>
              <Badge tone={statusTone[tx.adaptation.status]} dot size="sm" className="capitalize">
                {tx.adaptation.status}
              </Badge>
              <SegmentedControl
                label="Operating mode"
                value={tx.operating_mode}
                onChange={(mode) =>
                  run('mode', () => simApi.setTransmissionMode(mode), mode === 'fixed' ? 'Locked to fixed baseline settings' : 'Adaptation enabled')
                }
                options={[
                  { value: 'adaptive', label: 'Adaptive' },
                  { value: 'fixed', label: 'Fixed' },
                ]}
              />
            </>
          }
        >
          <SettingsTable current={tx.current} previous={tx.previous} />
          <dl className="mt-5 grid gap-x-6 sm:grid-cols-2">
            <KV k="Range resolution" v={`${num(tx.derived.range_resolution_m, 3)} m`} hint="CW: c·τ/2 · LFM: c/(2B)" />
            <KV k="Max unambiguous range" v={`${num(tx.derived.max_unambiguous_range_m, 0)} m`} hint="c·interval/2" />
            <KV k="Blind zone" v={`${num(tx.derived.blind_range_m, 2)} m`} hint="Receiver blanked while transmitting: c·τ/2" />
            <KV k="Duty cycle" v={percent(tx.derived.duty_cycle, 2)} />
            <KV k="Ping rate" v={`${num(tx.derived.ping_rate_hz, 2)} Hz`} />
            <KV k="Pulse energy (SL + 10 log τ)" v={`${num(tx.derived.pulse_energy_db, 1)} dB`} />
            <KV k="Directivity index (15 cm piston)" v={`${num(tx.derived.directivity_index_db, 1)} dB`} hint="10 log10(1 + (πD/λ)²)" />
            <KV k="Beamwidth (−3 dB)" v={`${num(tx.derived.beamwidth_deg, 1)}°`} hint="≈ 58.9° · λ / D" />
          </dl>
        </Panel>

        <Panel
          eyebrow="Controller"
          title="Decision inputs (latest ping)"
          description="Predictions are model(settings) + calibration offset learnt from measured echoes."
        >
          <dl>
            <KV k="Range of interest" v={`${num(d.range_of_interest_m, 0)} m${d.searching ? ' (search)' : ''}`} />
            <KV k="Listening window · required interval" v={`${num(d.window_m, 0)} m · ${num(d.required_interval_ms, 0)} ms`} />
            <KV k="Measured E/N0 (last valid echo)" v={d.measured_snr_db == null ? '—' : `${num(d.measured_snr_db, 1)} dB`} />
            <KV
              k="Calibration offset (≈ target strength)"
              v={d.calibration_offset_db == null ? 'prior TS (no echo yet)' : `${num(d.calibration_offset_db, 1)} dB`}
              hint="Measured E/N0 minus predicted E/N0 with TS = 0, smoothed"
            />
            <KV k="Predicted margin with current settings" v={d.predicted_margin_db == null ? '—' : `${num(d.predicted_margin_db, 1)} dB`} />
            <KV k="Pulse cap" v={pulse(d.pulse_cap_ms)} hint={d.pulse_cap_reason} />
            <KV k="Consecutive pings without a valid echo" v={d.consecutive_misses} />
          </dl>
          {d.candidates.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[380px] text-xs">
                <thead>
                  <tr className="text-right text-2xs text-fg-subtle uppercase">
                    <th className="pb-1.5 text-left font-medium">f</th>
                    <th className="pb-1.5 font-medium">DI</th>
                    <th className="pb-1.5 font-medium" title="Predicted E/N0 with the pulse at its cap">E/N0 @ cap</th>
                    <th className="pb-1.5 font-medium">Pulse needed</th>
                    <th className="pb-1.5 font-medium">Feasible</th>
                  </tr>
                </thead>
                <tbody className="readout">
                  {d.candidates.map((c) => {
                    const current = c.frequency_khz === tx.current.frequency_khz
                    return (
                      <tr key={c.frequency_khz} className={cn('border-t border-line/60 text-right', current && 'bg-primary/8')}>
                        <td className={cn('py-1 text-left', current ? 'text-primary-soft' : 'text-fg')}>
                          {c.frequency_khz} kHz{current && <span className="sr-only"> (current)</span>}
                        </td>
                        <td className="py-1 text-fg-muted">{num(c.di_db, 1)} dB</td>
                        <td className="py-1 text-fg">{num(c.predicted_snr_at_cap_db, 1)} dB</td>
                        <td className="py-1 text-fg-muted">{c.pulse_needed_ms > 1000 ? '> 1 s' : pulse(c.pulse_needed_ms)}</td>
                        <td className={cn('py-1', c.feasible ? 'text-success' : 'text-fg-subtle')}>{c.feasible ? 'yes' : 'no'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="mt-1.5 text-2xs text-fg-subtle">
                {d.best_effort
                  ? 'No frequency reaches the target margin: best-effort choice by highest predicted E/N0.'
                  : `Highest feasible frequency: ${d.best_frequency_khz} kHz (steps up only with ≥ hysteresis margin).`}{' '}
                The controller shares the simulator's physics model, so predictions here are more accurate than they would be at sea.
              </p>
            </div>
          )}
        </Panel>
      </div>

      <EventsPanel />

      <Panel
        eyebrow="Simulated"
        title="Live comparison with fixed settings"
        description={snap.comparison.note}
      >
        <ComparisonTable systems={snap.comparison.systems} />
        <ul className="mt-3 space-y-0.5 text-2xs text-fg-subtle">
          {snap.comparison.systems
            .filter((x) => x.kind === 'fixed')
            .map((x) => (
              <li key={x.id}>
                <span className="text-fg-muted">{x.label}:</span> {x.description}
              </li>
            ))}
        </ul>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Rule set" description="Evaluated in order after every adaptive ping. Green: published physics · blue: hard constraint · amber: hand-chosen policy (not validated).">
          <ul className="space-y-2.5">
            {RULES.map(([id, name, cls, text]) => (
              <li key={id} className="flex gap-3 text-xs">
                <span className="readout w-7 shrink-0 text-primary">{id}</span>
                <span className="min-w-0">
                  <span className="font-medium text-fg">{name}</span>{' '}
                  <Badge tone={classTone[cls]} size="sm" className="ml-1 align-middle">
                    {cls}
                  </Badge>
                  <span className="mt-0.5 block text-fg-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <ConfigPanel />
      </div>
    </div>
  )
}

const ROWS: { key: keyof TxSettings; label: string; fmt: (v: number | string) => string }[] = [
  { key: 'frequency_khz', label: 'Frequency', fmt: (v) => `${v} kHz` },
  { key: 'pulse_duration_ms', label: 'Pulse duration', fmt: (v) => pulse(Number(v)) },
  { key: 'waveform', label: 'Waveform', fmt: (v) => String(v) },
  { key: 'bandwidth_khz', label: 'Bandwidth', fmt: (v) => `${num(Number(v), 2)} kHz` },
  { key: 'interval_ms', label: 'Transmission interval', fmt: (v) => `${num(Number(v), 0)} ms` },
  { key: 'sound_speed_ref_m_s', label: 'Sound-speed reference', fmt: (v) => `${num(Number(v), 2)} m/s` },
]

export function SettingsTable({ current, previous }: { current: TxSettings; previous: TxSettings | null }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-xs">
        <thead>
          <tr className="text-left text-2xs text-fg-subtle uppercase">
            <th className="pb-2 font-medium">Parameter</th>
            <th className="pb-2 text-right font-medium">Previous</th>
            <th className="pb-2 text-right font-medium">Current</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => {
            const changed = previous && previous[r.key] !== current[r.key]
            return (
              <tr key={r.key} className="border-t border-line/60">
                <td className="py-2 text-fg-muted">{r.label}</td>
                <td className="py-2 text-right readout text-fg-subtle">{previous ? r.fmt(previous[r.key]) : '—'}</td>
                <td className={cn('py-2 text-right readout', changed ? 'text-primary-soft' : 'text-fg')}>
                  {r.fmt(current[r.key])}
                  {changed && <span className="sr-only"> (changed)</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-2xs text-fg-subtle">“Previous” is the configuration before the most recent adaptation; changed values are highlighted.</p>
    </div>
  )
}

const CATEGORIES = ['all', 'environment', 'performance', 'geometry'] as const

function EventsPanel() {
  const events = useSim((s) => s.events)
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>('all')
  const shown = (cat === 'all' ? events : events.filter((e) => e.category === cat)).slice(-60).reverse()
  return (
    <Panel
      eyebrow="Audit trail"
      title="Adaptation events"
      description="Every parameter change with the condition that triggered it and the reason."
      action={
        <SegmentedControl
          label="Trigger category"
          value={cat}
          onChange={setCat}
          options={CATEGORIES.map((c) => ({
            value: c,
            label: c === 'all' ? 'All' : c[0].toUpperCase() + c.slice(1),
            count: c === 'all' ? events.length : events.filter((e) => e.category === c).length,
          }))}
        />
      }
      bodyClassName="p-0"
    >
      {shown.length === 0 ? (
        <p className="p-5 text-xs text-fg-subtle">No adaptation events yet. Start the simulation or change the environment.</p>
      ) : (
        <div className="max-h-[480px] overflow-auto scrollbar-thin">
          <table className="w-full min-w-[860px] text-xs">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-left text-2xs text-fg-subtle uppercase">
                <th className="px-5 py-2 font-medium">Time</th>
                <th className="py-2 pr-3 font-medium">Rule</th>
                <th className="py-2 font-medium">Parameter</th>
                <th className="py-2 font-medium">Previous → new</th>
                <th className="py-2 pr-5 font-medium">Trigger / reason</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((ev) => (
                <EventRow key={ev.seq} ev={ev} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function EventRow({ ev }: { ev: AdaptationEvent }) {
  return (
    <tr className="border-t border-line/60 align-top">
      <td className="px-5 py-2.5 readout whitespace-nowrap text-fg-muted">
        T+{simClock(ev.sim_time_s)}
        <span className="block text-2xs text-fg-subtle">{wallClock(ev.wall_time)}</span>
      </td>
      <td className="py-2.5 pr-3 readout text-primary">
        {ev.rule}
        <span className="block font-sans text-2xs text-fg-subtle">{ev.rule_class}</span>
      </td>
      <td className="py-2.5 pr-3 text-fg">{ev.label}</td>
      <td className="py-2.5 pr-3 readout whitespace-nowrap">
        <span className="text-fg-subtle">{eventValue(ev.previous, ev.unit)}</span>
        <span className="text-fg-subtle"> → </span>
        <span className="text-primary-soft">{eventValue(ev.new, ev.unit)}</span>
      </td>
      <td className="py-2.5 pr-5">
        <p className="text-fg-muted">{ev.trigger}</p>
        <p className="mt-0.5 text-fg-subtle">{ev.reason}</p>
      </td>
    </tr>
  )
}

type NumKey = { [K in keyof AdaptationConfig]: AdaptationConfig[K] extends number ? K : never }[keyof AdaptationConfig]

const FIELDS: { key: NumKey; label: string; unit: string; step: number }[] = [
  { key: 'target_margin_db', label: 'Target margin above threshold', unit: 'dB', step: 0.5 },
  { key: 'high_margin_db', label: 'Upper margin (shorten pulse)', unit: 'dB', step: 0.5 },
  { key: 'frequency_up_hysteresis_db', label: 'Frequency step-up hysteresis', unit: 'dB', step: 0.5 },
  { key: 'pulse_min_ms', label: 'Minimum pulse', unit: 'ms', step: 0.05 },
  { key: 'pulse_max_ms', label: 'Maximum pulse', unit: 'ms', step: 0.5 },
  { key: 'lfm_threshold_ms', label: 'LFM threshold', unit: 'ms', step: 0.1 },
  { key: 'range_window_factor', label: 'Window factor', unit: '×', step: 0.1 },
  { key: 'interval_guard', label: 'Interval guard', unit: '×', step: 0.05 },
  { key: 'max_duty_cycle', label: 'Max duty cycle', unit: 'fraction', step: 0.005 },
  { key: 'prior_target_strength_db', label: 'Prior target strength', unit: 'dB', step: 1 },
  { key: 'calibration_smoothing', label: 'Calibration smoothing', unit: '0–1', step: 0.05 },
  { key: 'cooldown_pings', label: 'Cooldown', unit: 'pings', step: 1 },
  { key: 'lost_echo_pings', label: 'Echo-loss count', unit: 'pings', step: 1 },
  { key: 'search_range_m', label: 'Search range', unit: 'm', step: 50 },
  { key: 'sound_speed_log_threshold_m_s', label: 'Sound-speed log threshold', unit: 'm/s', step: 0.1 },
]

export function ConfigPanel() {
  const { run, pending } = useSimAction()
  const [cfg, setCfg] = useState<AdaptationConfig | null>(null)
  const [steps, setSteps] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  // Operating mode is controlled separately; never let a stale form value override it.
  const enabled = useSim((s) => s.snapshot?.transmission.adaptation.enabled ?? true)

  useEffect(() => {
    let alive = true
    simApi
      .getAdaptationConfig()
      .then((c) => {
        if (!alive) return
        setCfg(c)
        setSteps(c.frequency_steps_khz.join(', '))
      })
      .catch(() => alive && setLoadError('Could not load the configuration.'))
    return () => {
      alive = false
    }
  }, [])

  const apply = (c: AdaptationConfig | undefined) => {
    if (!c) return
    setCfg(c)
    setSteps(c.frequency_steps_khz.join(', '))
  }

  return (
    <Panel title="Algorithm configuration" description="Tunable thresholds. Changes apply from the next frame.">
      {loadError && <p className="text-xs text-danger">{loadError}</p>}
      {!cfg && !loadError && <p className="text-xs text-fg-subtle">Loading…</p>}
      {cfg && (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const freq = steps
              .split(/[,\s]+/)
              .map(Number)
              .filter((n) => Number.isFinite(n) && n > 0)
            apply(await run('save', () => simApi.putAdaptationConfig({ ...cfg, enabled, frequency_steps_khz: freq }), 'Configuration applied'))
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="block text-2xs text-fg-muted">
                {f.label} <span className="text-fg-subtle">({f.unit})</span>
                <input
                  type="number"
                  step={f.step}
                  value={cfg[f.key]}
                  onChange={(e) => setCfg({ ...cfg, [f.key]: Number(e.target.value) })}
                  className="mt-1 h-8 w-full rounded-control border border-line-strong bg-surface-sunken px-2 readout text-xs text-fg"
                />
              </label>
            ))}
            <label className="block text-2xs text-fg-muted sm:col-span-2">
              Frequency steps <span className="text-fg-subtle">(kHz, comma-separated)</span>
              <input
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                className="mt-1 h-8 w-full rounded-control border border-line-strong bg-surface-sunken px-2 readout text-xs text-fg"
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="ghost" leftIcon={RotateCcw} disabled={!!pending} onClick={async () => apply(await run('defaults', simApi.resetAdaptationConfig, 'Defaults restored'))}>
              Defaults
            </Button>
            <Button size="sm" variant="primary" type="submit" leftIcon={Save} disabled={!!pending}>
              Apply
            </Button>
          </div>
        </form>
      )}
    </Panel>
  )
}
