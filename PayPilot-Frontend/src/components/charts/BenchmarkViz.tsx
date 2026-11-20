/**
 * Forest plots for the seeded benchmark: one row per system, dot = mean across seeds,
 * bar = 95 % t-interval across seeds. Metrics are shown side by side so benefits
 * (detection) are never read without their costs (update rate, pulse energy).
 */
import type { BenchmarkResult, BenchmarkSystem, MeanCI } from '../../features/sim/types'

const COLORS: Record<string, string> = {
  adaptive: '#46e0ff',
  fixed_a: '#ff9a5c',
  fixed_a_c: '#ffb98a',
  fixed_b: '#e0703a',
}

function short(s: BenchmarkSystem) {
  if (s.oracle) return 'Best fixed (hindsight)'
  if (s.id === 'adaptive') return 'Adaptive'
  if (s.id === 'fixed_a') return 'Fixed A'
  if (s.id === 'fixed_a_c') return 'Fixed A + measured c'
  if (s.id === 'fixed_b') return 'Fixed B'
  return s.label
}

function Forest({
  title,
  unit,
  systems,
  pick,
  lo,
  hi,
  digits,
  note,
}: {
  title: string
  unit: string
  systems: BenchmarkSystem[]
  pick: (s: BenchmarkSystem) => MeanCI
  lo: number
  hi: number
  digits: number
  note: string
}) {
  const W = 300
  const row = 24
  const P = { l: 6, r: 8, t: 24, b: 20 }
  const H = P.t + P.b + row * systems.length
  const x = (v: number) => P.l + ((v - lo) / (hi - lo || 1)) * (W - P.l - P.r)
  return (
    <figure className="min-w-0 rounded-card holo p-3">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="font-display text-sm font-semibold text-fg">{title}</span>
        <span className="label-tech">{unit}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-auto w-full" role="img" aria-label={`${title} by system with 95 % confidence intervals`}>
        {[lo, (lo + hi) / 2, hi].map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={P.t - 4} y2={H - P.b} stroke="#0f2036" />
            <text x={x(v)} y={H - 6} textAnchor="middle" fontSize="9" fill="#6a8099" className="readout">
              {v.toFixed(digits)}
            </text>
          </g>
        ))}
        {systems.map((s, i) => {
          const m = pick(s)
          const y = P.t + row * i + row / 2
          const col = s.oracle ? '#a493ff' : COLORS[s.id] ?? '#cfdbe7'
          return (
            <g key={s.id + (s.oracle ? 'o' : '')}>
              <text x={P.l} y={y - 7} fontSize="9" fill="#9fb2c6">
                {short(s)}
              </text>
              {m.mean != null && m.ci95 && (
                <line x1={x(Math.max(lo, m.ci95[0]))} x2={x(Math.min(hi, m.ci95[1]))} y1={y + 3} y2={y + 3} stroke={col} strokeWidth="2" strokeOpacity="0.6" />
              )}
              {m.mean != null ? (
                <>
                  <circle cx={x(Math.min(hi, Math.max(lo, m.mean)))} cy={y + 3} r="4" fill={col} style={{ filter: `drop-shadow(0 0 4px ${col})` }} />
                  <text x={W - P.r} y={y - 7} textAnchor="end" fontSize="9" fill="#e6eef6" className="readout">
                    {m.mean.toFixed(digits)}
                  </text>
                </>
              ) : (
                <text x={W - P.r} y={y + 6} textAnchor="end" fontSize="9" fill="#6a8099">
                  n/a
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <p className="mt-1 text-3xs leading-snug text-fg-subtle">{note}</p>
    </figure>
  )
}

export function BenchmarkViz({ result }: { result: BenchmarkResult }) {
  const S = result.systems
  const max = (f: (s: BenchmarkSystem) => MeanCI) => Math.max(...S.map((s) => f(s).ci95?.[1] ?? f(s).mean ?? 0))
  const min = (f: (s: BenchmarkSystem) => MeanCI) => Math.min(...S.map((s) => f(s).ci95?.[0] ?? f(s).mean ?? 0))
  const err = (s: BenchmarkSystem) => s.mean_abs_range_error_m
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Forest title="Detection probability" unit="per ping" systems={S} pick={(s) => s.detection_rate} lo={0} hi={1} digits={2} note="Unambiguous echo above threshold. Mean ± 95 % t-interval across seeds." />
      <Forest title="Update rate" unit="pings / s" systems={S} pick={(s) => s.ping_rate_hz} lo={0} hi={Math.max(1.1, max((s) => s.ping_rate_hz))} digits={2} note="How often each system can refresh its range. Longer windows cost update rate." />
      <Forest
        title="Pulse-energy metric"
        unit="dB re 1 µPa²·s"
        systems={S}
        pick={(s) => s.mean_energy_db}
        lo={Math.floor(min((s) => s.mean_energy_db) - 2)}
        hi={Math.ceil(max((s) => s.mean_energy_db) + 2)}
        digits={0}
        note="Acoustic SL + 10 log τ averaged over pings. Not measured electrical or acoustic energy consumption."
      />
      <Forest title="Mean |range error|" unit="m" systems={S} pick={err} lo={0} hi={Math.max(0.1, max(err))} digits={2} note="Detected pings only. Fixed A's error is the 1500 m/s sound-speed assumption." />
      <Forest title="Range resolution" unit="m" systems={S} pick={(s) => s.mean_resolution_m} lo={0} hi={Math.max(0.1, max((s) => s.mean_resolution_m))} digits={2} note="c·τ/2 (CW) or c/2B (LFM), averaged over pings. Lower is finer." />
      <Forest title="Detection when far (> 800 m)" unit="per ping" systems={S} pick={(s) => s.pd_far} lo={0} hi={1} digits={2} note="Range-binned detection rate; n/a when the scenario never reaches that range." />
    </div>
  )
}
