/**
 * Candidate-frequency analysis, drawn from the controller's own decision rows
 * (transmission.adaptation.decision.candidates). Nothing here is recomputed: absorption,
 * spreading, noise, directivity and predicted E/N0 are the values the controller used.
 */
import { useMemo } from 'react'
import { useSim } from '../../features/sim/store'
import type { Snapshot } from '../../features/sim/types'
import { cn } from '../../lib/cn'
import { num, pulse } from '../../lib/format'

const W = 760
const H = 300
const PAD = { l: 44, r: 12, t: 18, b: 92 }

export function FrequencyAnalysis({ snap }: { snap: Snapshot }) {
  const events = useSim((s) => s.events)
  const d = snap.transmission.adaptation.decision
  const cur = snap.transmission.current.frequency_khz
  const dt = snap.sonar.transducer.detection_threshold_db
  const need = dt + 6
  const rows = d.candidates
  const lastR3 = useMemo(() => [...events].reverse().find((e) => e.rule === 'R3'), [events])

  if (!rows.length) return <p className="text-xs text-fg-subtle">The controller has not evaluated candidates yet — start the simulation.</p>

  const vals = rows.map((r) => r.predicted_snr_at_cap_db)
  const lo = Math.min(-10, ...vals) - 2
  const hi = Math.max(need + 8, ...vals) + 2
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const col = iw / rows.length
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * ih
  const maxAbs = Math.max(...rows.map((r) => r.two_way_absorption_db), 1)

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Predicted detection margin for every candidate frequency">
        <defs>
          <linearGradient id="fa-ok" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#46e0ff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#46e0ff" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="fa-no" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6a8099" stopOpacity="0.4" />
            <stop offset="1" stopColor="#6a8099" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {[lo, (lo + hi) / 2, hi].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#0f2036" />
            <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#6a8099" className="readout">
              {v.toFixed(0)}
            </text>
          </g>
        ))}
        <text x={10} y={PAD.t + ih / 2} fontSize="10" fill="#6a8099" transform={`rotate(-90 10 ${PAD.t + ih / 2})`} textAnchor="middle">
          predicted E/N0 at pulse cap (dB)
        </text>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(dt)} y2={y(dt)} stroke="#f2b54d" strokeDasharray="4 4" />
        <text x={PAD.l + 4} y={y(dt) + 12} textAnchor="start" fontSize="10" fill="#f2b54d">
          detection threshold {dt} dB
        </text>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(need)} y2={y(need)} stroke="#3fe0b5" strokeDasharray="2 3" />
        <text x={PAD.l + 4} y={y(need) - 4} textAnchor="start" fontSize="10" fill="#3fe0b5">
          target {need} dB (threshold + 6 dB margin)
        </text>

        {rows.map((r, i) => {
          const cx = PAD.l + col * i + col / 2
          const bw = Math.min(46, col * 0.5)
          const top = y(Math.max(lo, r.predicted_snr_at_cap_db))
          const base = y(lo)
          const selected = r.frequency_khz === cur
          const absW = (r.two_way_absorption_db / maxAbs) * (col * 0.8)
          return (
            <g key={r.frequency_khz}>
              {selected && <rect x={cx - col / 2 + 3} y={PAD.t} width={col - 6} height={H - PAD.t - 6} rx="8" fill="rgba(70,224,255,0.05)" stroke="rgba(70,224,255,0.35)" />}
              <rect
                x={cx - bw / 2}
                y={top}
                width={bw}
                height={Math.max(1, base - top)}
                rx="3"
                fill={r.feasible ? 'url(#fa-ok)' : 'url(#fa-no)'}
                stroke={r.feasible ? '#46e0ff' : '#6a8099'}
                strokeOpacity={0.7}
                style={{ transition: 'y 500ms, height 500ms' }}
              />
              <text x={cx} y={top - 5} textAnchor="middle" fontSize="10" fill={r.feasible ? '#a5eefb' : '#9fb2c6'} className="readout">
                {r.predicted_snr_at_cap_db.toFixed(1)}
              </text>
              <text x={cx} y={H - PAD.b + 16} textAnchor="middle" fontSize="12" fill={selected ? '#46e0ff' : '#e6eef6'} className="readout" fontWeight={selected ? 600 : 400}>
                {r.frequency_khz} kHz
              </text>
              {/* budget breakdown */}
              <rect x={cx - (col * 0.8) / 2} y={H - PAD.b + 26} width={absW} height="5" rx="2" fill="#1ba585" />
              <text x={cx} y={H - PAD.b + 44} textAnchor="middle" fontSize="9" fill="#3fe0b5" className="readout">
                abs −{r.two_way_absorption_db.toFixed(1)}
              </text>
              <text x={cx} y={H - PAD.b + 56} textAnchor="middle" fontSize="9" fill="#9fb2c6" className="readout">
                NL {r.noise_db.toFixed(0)} · DI +{r.di_db.toFixed(0)}
              </text>
              <text x={cx} y={H - PAD.b + 70} textAnchor="middle" fontSize="9" fill={r.feasible ? '#3fd7a4' : '#6a8099'}>
                {r.feasible ? `✓ ${pulse(r.pulse_needed_ms)} needed` : r.pulse_needed_ms > 1000 ? '✕ needs > 1 s' : `✕ needs ${pulse(r.pulse_needed_ms)}`}
              </text>
              {selected && (
                <text x={cx} y={H - PAD.b + 84} textAnchor="middle" fontSize="9" fill="#46e0ff" className="readout">
                  ▲ SELECTED
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-2 grid gap-2 text-2xs text-fg-subtle md:grid-cols-[1fr_auto]">
        <span>
          Predicted E/N0 = SL + 10 log τ<sub>cap</sub> − 2·(20 log R + αR) − (NL − DI) + calibration offset ({d.calibration_offset_db == null ? 'prior TS' : `${num(d.calibration_offset_db, 1)} dB`}) at R ={' '}
          {num(d.range_of_interest_m, 0)} m. Spreading −{num(rows[0].two_way_spreading_db, 1)} dB is the same for every frequency; absorption, noise and directivity decide. Policy: highest feasible frequency
          (narrowest beam), +2 dB hysteresis before stepping up.
        </span>
        {lastR3 && (
          <span key={lastR3.seq} className={cn('rounded-control border border-intel/30 px-2 py-1 readout text-intel', 'animate-flash')}>
            Last R3: {lastR3.previous} → {lastR3.new} kHz
          </span>
        )}
      </figcaption>
    </figure>
  )
}
