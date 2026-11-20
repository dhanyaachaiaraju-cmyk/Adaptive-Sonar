import { Activity, Cpu, Radio, RadioReceiver, Thermometer, Wifi } from 'lucide-react'
import { useSim } from '../../features/sim/store'
import type { Snapshot } from '../../features/sim/types'
import { cn } from '../../lib/cn'
import { num, pulse } from '../../lib/format'
import { AnimatedNumber, DataTag, Sparkline, type Provenance } from './primitives'

/* ------------------------------------------------------------------------ */
/* Sound speed                                                               */
/* ------------------------------------------------------------------------ */
export function SoundSpeedInstrument({ snap, compact }: { snap: Snapshot; compact?: boolean }) {
  const events = useSim((s) => s.events)
  const env = snap.environment
  const r1 = events.filter((e) => e.rule === 'R1')
  const lastR1 = r1.at(-1)
  const delta = env.sound_speed_m_s - 1500
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="label-tech">Speed of sound</span>
        <DataTag kind="calculated" />
      </div>
      <p className="mt-1 flex items-baseline gap-1.5">
        <AnimatedNumber value={env.sound_speed_m_s} digits={1} className={cn('font-medium text-fg', compact ? 'text-3xl' : 'text-hero')} />
        <span className="readout text-xs text-fg-subtle">m/s</span>
      </p>
      <p className="readout text-2xs text-fg-muted">
        {delta >= 0 ? '+' : ''}
        {num(delta, 1)} m/s vs 1500 nominal · range bias if ignored {num(((1500 - env.sound_speed_m_s) / env.sound_speed_m_s) * 100, 2)} %
      </p>
      <Sparkline field="sound_speed_m_s" color="#3fe0b5" className="mt-2 h-10 w-full" />
      <dl className="mt-2 grid grid-cols-3 gap-2 readout text-2xs">
        <div>
          <dt className="text-fg-subtle">T</dt>
          <dd className="text-env">{num(env.measured.temperature_c, 2)} °C</dd>
        </div>
        <div>
          <dt className="text-fg-subtle">S</dt>
          <dd className="text-env">{num(env.measured.salinity_psu, 2)} PSU</dd>
        </div>
        <div>
          <dt className="text-fg-subtle">D (from p)</dt>
          <dd className="text-env">{num(env.measured.depth_m, 1)} m</dd>
        </div>
      </dl>
      {!compact && (
        <p className="mt-2 text-2xs text-fg-subtle">
          Mackenzie (1981) from simulated CTD readings. R1 corrections logged: <span className="readout text-fg-muted">{r1.length}</span>
          {lastR1 && (
            <>
              {' '}· last {num(Number(lastR1.previous), 2)} → <span className="text-env">{num(Number(lastR1.new), 2)} m/s</span>
            </>
          )}
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Range & resolution                                                        */
/* ------------------------------------------------------------------------ */
export function RangeInstrument({ snap }: { snap: Snapshot }) {
  const tx = snap.transmission
  const d = tx.derived
  const ping = snap.primary.last_ping
  const truth = snap.primary.target.range_m
  const est = ping?.status === 'detected' ? ping.estimated_range_m : null
  const max = Math.max(d.max_unambiguous_range_m, truth) * 1.12
  const x = (m: number) => `${Math.min(100, (m / max) * 100)}%`
  const ambiguous = truth > d.max_unambiguous_range_m
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="label-tech">Target distance (R = c·t / 2)</span>
          <p className="mt-0.5 flex items-baseline gap-1.5">
            <AnimatedNumber value={est} digits={1} className="text-3xl font-medium text-fg" />
            <span className="readout text-xs text-fg-subtle">m measured</span>
          </p>
        </div>
        <div className="text-right readout text-2xs text-fg-muted">
          <p>truth {num(truth, 1)} m <DataTag kind="simulated" className="ml-1" /></p>
          <p>echo {ping?.measured_echo_time_ms != null && ping.status === 'detected' ? `${num(ping.measured_echo_time_ms, 2)} ms` : '—'}</p>
        </div>
      </div>
      <div className="relative mt-4 h-14">
        {/* scale */}
        <div className="absolute inset-x-0 top-6 h-px bg-line-strong" />
        {/* unambiguous window */}
        <div className="absolute top-4 h-5 rounded-sm bg-acoustic/8 ring-1 ring-acoustic/25 ring-inset" style={{ left: 0, width: x(d.max_unambiguous_range_m) }} />
        <span className="absolute top-0 -translate-x-full readout text-3xs text-acoustic/80" style={{ left: x(d.max_unambiguous_range_m) }}>
          unambiguous {num(d.max_unambiguous_range_m, 0)} m
        </span>
        {/* blind zone */}
        <div className="absolute top-4 h-5 rounded-sm bg-danger/30" style={{ left: 0, width: `max(2px, ${x(d.blind_range_m)})` }} title={`Blind zone ${num(d.blind_range_m, 2)} m`} />
        {/* truth marker */}
        <div className="absolute top-2 h-9 w-px bg-ref" style={{ left: x(truth) }} />
        <span className="absolute top-11 -translate-x-1/2 readout text-3xs text-ref" style={{ left: x(truth) }}>
          T-01
        </span>
        {/* measured marker */}
        {est != null && (
          <div className="absolute top-3.5 size-3 -translate-x-1/2 rotate-45 border border-acoustic bg-acoustic/40 shadow-[0_0_12px_#46e0ff]" style={{ left: x(est) }} />
        )}
        {ambiguous && (
          <span className="absolute top-11 right-0 readout text-3xs text-intel">target beyond window → echo folds (ambiguous)</span>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 readout text-2xs sm:grid-cols-4">
        <div>
          <dt className="text-fg-subtle">Blind zone c·τ/2</dt>
          <dd className="text-fg">{num(d.blind_range_m, 2)} m</dd>
        </div>
        <div>
          <dt className="text-fg-subtle">Resolution {tx.current.waveform === 'LFM' ? 'c/2B' : 'c·τ/2'}</dt>
          <dd className="text-fg">{num(d.range_resolution_m, 3)} m</dd>
        </div>
        <div>
          <dt className="text-fg-subtle">Window c·T/2</dt>
          <dd className="text-fg">{num(d.max_unambiguous_range_m, 0)} m</dd>
        </div>
        <div>
          <dt className="text-fg-subtle">Error vs truth</dt>
          <dd className="text-fg">{ping?.range_error_m != null && ping.status === 'detected' ? `${num(ping.range_error_m, 3)} m` : '—'}</dd>
        </div>
      </dl>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Frequency                                                                  */
/* ------------------------------------------------------------------------ */
export function FrequencyInstrument({ snap }: { snap: Snapshot }) {
  const tx = snap.transmission
  const d = tx.adaptation.decision
  const band = snap.sonar.transducer
  const lo = Math.log10(band.band_min_khz)
  const hi = Math.log10(band.band_max_khz)
  const x = (f: number) => `${((Math.log10(f) - lo) / (hi - lo)) * 100}%`
  const f = tx.current.frequency_khz
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-tech">Transmission frequency</span>
        <span className="label-tech text-intel">{tx.adaptation.status}</span>
      </div>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <AnimatedNumber value={f} digits={0} className="text-3xl font-medium text-fg" />
        <span className="readout text-xs text-fg-subtle">kHz {tx.current.waveform}{tx.current.waveform === 'LFM' ? ` · ${num(tx.current.bandwidth_khz, 1)} kHz sweep` : ''}</span>
      </p>
      <div className="relative mt-4 h-12">
        <div className="absolute inset-x-0 top-5 h-1 rounded-full bg-gradient-to-r from-acoustic/10 via-acoustic/25 to-intel/30" />
        {tx.current.waveform === 'LFM' && (
          <div
            className="absolute top-4 h-3 rounded-sm bg-acoustic/25"
            style={{ left: x(Math.max(band.band_min_khz, f - tx.current.bandwidth_khz / 2)), width: `calc(${x(Math.min(band.band_max_khz, f + tx.current.bandwidth_khz / 2))} - ${x(Math.max(band.band_min_khz, f - tx.current.bandwidth_khz / 2))})` }}
            title="LFM sweep"
          />
        )}
        {d.candidates.map((c) => (
          <div key={c.frequency_khz} className="absolute top-3.5 -translate-x-1/2" style={{ left: x(c.frequency_khz) }} title={`${c.frequency_khz} kHz: ${c.feasible ? 'meets target' : 'cannot meet target within pulse cap'}`}>
            <div className={cn('mx-auto h-4 w-0.5 rounded-full', c.feasible ? 'bg-success' : 'bg-fg-subtle/50')} />
            <span className={cn('mt-1 block readout text-3xs', c.frequency_khz === f ? 'text-acoustic' : 'text-fg-subtle')}>{c.frequency_khz}</span>
          </div>
        ))}
        <div className="absolute top-1.5 size-0 -translate-x-1/2 border-x-[6px] border-t-[8px] border-x-transparent border-t-acoustic drop-shadow-[0_0_6px_#46e0ff] transition-[left] duration-500" style={{ left: x(f) }} />
      </div>
      <p className="text-2xs text-fg-subtle">
        Green ticks: candidates predicted to reach the target margin within the pulse cap.{' '}
        {d.best_effort ? 'None reach it — best-effort choice.' : `Highest feasible: ${d.best_frequency_khz} kHz.`}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Detection margin gauge                                                     */
/* ------------------------------------------------------------------------ */
export function MarginGauge({ snap, size = 148 }: { snap: Snapshot; size?: number }) {
  const ping = snap.primary.last_ping
  const dt = snap.sonar.transducer.detection_threshold_db
  const lo = -10
  const hi = 50
  const v = ping ? Math.min(hi, Math.max(lo, ping.snr_db)) : lo
  const a0 = Math.PI * 0.8
  const a1 = Math.PI * 2.2
  const ang = (x: number) => a0 + ((x - lo) / (hi - lo)) * (a1 - a0)
  const r = size / 2 - 10
  const cx = size / 2
  const cy = size / 2
  const arc = (from: number, to: number) => {
    const p0 = [cx + r * Math.cos(ang(from)), cy + r * Math.sin(ang(from))]
    const p1 = [cx + r * Math.cos(ang(to)), cy + r * Math.sin(ang(to))]
    const large = ang(to) - ang(from) > Math.PI ? 1 : 0
    return `M${p0[0]},${p0[1]} A${r},${r} 0 ${large} 1 ${p1[0]},${p1[1]}`
  }
  const status = ping?.status ?? 'none'
  const col = status === 'detected' ? '#46e0ff' : status === 'ambiguous' ? '#a493ff' : '#f2b54d'
  const tick = (x: number) => [cx + (r - 9) * Math.cos(ang(x)), cy + (r - 9) * Math.sin(ang(x)), cx + (r + 5) * Math.cos(ang(x)), cy + (r + 5) * Math.sin(ang(x))]
  const tt = tick(dt)
  const tm = tick(dt + 6)
  return (
    <figure className="flex flex-col items-center">
      <svg width={size} height={size * 0.86} viewBox={`0 0 ${size} ${size * 0.86}`} role="img" aria-label={`Echo E/N0 ${ping ? ping.snr_db.toFixed(1) : 'none'} dB, threshold ${dt} dB`}>
        <path d={arc(lo, hi)} fill="none" stroke="#11223a" strokeWidth="7" strokeLinecap="round" />
        <path d={arc(lo, dt)} fill="none" stroke="rgba(242,107,107,0.25)" strokeWidth="7" />
        {ping && <path d={arc(lo, v)} fill="none" stroke={col} strokeWidth="7" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${col})`, transition: 'all 400ms' }} />}
        <line x1={tt[0]} y1={tt[1]} x2={tt[2]} y2={tt[3]} stroke="#e6eef6" strokeWidth="1.5" />
        <line x1={tm[0]} y1={tm[1]} x2={tm[2]} y2={tm[3]} stroke="#3fe0b5" strokeWidth="1.5" strokeDasharray="2 2" />
        <text x={cx} y={cy - 2} textAnchor="middle" className="readout" fontSize="22" fill="#e6eef6">
          {ping ? ping.snr_db.toFixed(1) : '—'}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" fill="#6a8099" className="readout">
          dB · E/N0
        </text>
      </svg>
      <figcaption className="-mt-2 text-center text-2xs text-fg-muted">
        <span style={{ color: col }}>{status.replace(/_/g, ' ')}</span> · threshold {dt} dB · target +6 dB
      </figcaption>
    </figure>
  )
}

/* ------------------------------------------------------------------------ */
/* Depth ruler                                                                 */
/* ------------------------------------------------------------------------ */
export function DepthRuler({ snap, height = 220 }: { snap: Snapshot; height?: number }) {
  const env = snap.environment
  const max = Math.max(700, Math.ceil((env.truth.depth_m * 1.3) / 100) * 100)
  const y = (d: number) => `${(d / max) * 100}%`
  const ticks = Array.from({ length: 8 }, (_, i) => (max / 7) * i)
  return (
    <div className="flex gap-3" style={{ height }}>
      <div className="relative w-14 shrink-0 border-r border-line-strong">
        {ticks.map((t) => (
          <div key={t} className="absolute right-0 flex -translate-y-1/2 items-center gap-1" style={{ top: y(t) }}>
            <span className="readout text-3xs text-fg-subtle">{Math.round(t)}</span>
            <span className="h-px w-2 bg-line-strong" />
          </div>
        ))}
        <div className="absolute right-0 left-0 border-t border-dashed border-env/60" style={{ top: y(env.thermocline_depth_m) }} title="Thermocline (assumed profile)" />
        {env.dive_phase && (
          <div className="absolute -right-1.5 size-0 -translate-y-1/2 border-y-[5px] border-r-[6px] border-y-transparent border-r-fg-subtle" style={{ top: y(env.dive_phase.target_depth_m) }} title={`Dive target ${env.dive_phase.target_depth_m} m`} />
        )}
        <div className="absolute -right-2 size-3.5 -translate-y-1/2 rounded-full border-2 border-acoustic bg-abyss shadow-[0_0_10px_#46e0ff] transition-[top] duration-500" style={{ top: y(env.truth.depth_m) }} />
      </div>
      <div className="flex min-w-0 flex-col justify-between py-1 text-2xs">
        <div>
          <span className="label-tech">Depth</span>
          <p className="readout text-xl text-fg">{num(env.truth.depth_m, 1)} <span className="text-xs text-fg-subtle">m</span></p>
          <p className="readout text-fg-muted">{num(env.truth.pressure_dbar, 1)} dbar · {num(env.truth.pressure_dbar / 100, 3)} MPa</p>
        </div>
        <div className="space-y-1 text-fg-subtle">
          <p><span className="text-env">- - -</span> thermocline ~{Math.round(env.thermocline_depth_m)} m (assumed)</p>
          {env.dive_phase ? <p>▸ {env.dive_phase.label.toLowerCase()} to {Math.round(env.dive_phase.target_depth_m)} m</p> : <p>Depth held (manual)</p>}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* System health                                                              */
/* ------------------------------------------------------------------------ */
export function HealthPanel({ snap }: { snap: Snapshot }) {
  const conn = useSim((s) => s.connection)
  const ping = snap.primary.last_ping
  const rows: { name: string; icon: typeof Radio; state: string; tone: 'ok' | 'warn' | 'off'; tag: Provenance }[] = [
    { name: 'Transmitter', icon: Radio, state: `${snap.transmission.current.frequency_khz} kHz ${snap.transmission.current.waveform} · ${pulse(snap.transmission.current.pulse_duration_ms)}`, tone: 'ok', tag: 'simulated' },
    { name: 'Receiver', icon: RadioReceiver, state: ping ? ping.status.replace(/_/g, ' ') : 'idle', tone: ping?.status === 'detected' ? 'ok' : 'warn', tag: 'simulated' },
    { name: 'Controller (R1–R6)', icon: Cpu, state: snap.transmission.adaptation.status, tone: snap.transmission.adaptation.status === 'searching' ? 'warn' : 'ok', tag: 'implemented' },
    { name: 'Sensors (CTD)', icon: Thermometer, state: snap.environment.validity_warnings.length ? 'outside model range' : 'nominal', tone: snap.environment.validity_warnings.length ? 'warn' : 'ok', tag: 'measured-sim' },
    { name: 'Telemetry link', icon: Wifi, state: conn === 'online' ? 'backend API online' : 'backend offline', tone: conn === 'online' ? 'ok' : 'warn', tag: 'implemented' },
    { name: 'STM32 hardware', icon: Activity, state: 'not connected', tone: 'off', tag: 'requires-hardware' },
  ]
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.name} className="flex items-center gap-2 text-2xs" title={r.state}>
          <span className={cn('size-1.5 shrink-0 rounded-full', r.tone === 'ok' ? 'bg-success' : r.tone === 'warn' ? 'bg-warning' : 'bg-fg-subtle')} aria-hidden />
          <span className="w-[7.5rem] shrink-0 truncate text-fg-muted">{r.name}</span>
          <span className="min-w-0 flex-1 truncate readout text-fg">{r.state}</span>
          <DataTag kind={r.tag} />
        </li>
      ))}
    </ul>
  )
}
