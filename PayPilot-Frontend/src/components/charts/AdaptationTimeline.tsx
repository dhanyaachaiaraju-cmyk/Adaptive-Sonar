import { ArrowRight, X } from 'lucide-react'
import { useState } from 'react'
import { CLASS_STYLE, RULE_BY_ID, RULES, type RuleClass } from '../../features/sim/rules'
import { useSim } from '../../features/sim/store'
import type { AdaptationEvent } from '../../features/sim/types'
import { cn } from '../../lib/cn'
import { eventValue, simClock, wallClock } from '../../lib/format'
import { select, useSelection } from '../../lib/ui-store'
import { DataTag } from '../instruments/primitives'

const SPANS = [
  { s: 120, l: '2 min' },
  { s: 600, l: '10 min' },
  { s: 1800, l: '30 min' },
  { s: 0, l: 'All' },
]

function Glyph({ cls, x, y, r, sel }: { cls: RuleClass; x: number; y: number; r: number; sel: boolean }) {
  const c = CLASS_STYLE[cls].color
  const common = { fill: sel ? c : `${c}cc`, stroke: sel ? '#ffffff' : 'none', strokeWidth: sel ? 1.5 : 0 }
  if (cls === 'physics') return <circle cx={x} cy={y} r={r} {...common} />
  if (cls === 'constraint') return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={1} {...common} />
  if (cls === 'heuristic') return <path d={`M${x},${y - r - 1} L${x + r + 1},${y} L${x},${y + r + 1} L${x - r - 1},${y} Z`} {...common} />
  return <path d={`M${x},${y - r - 1} L${x + r + 1},${y + r} L${x - r - 1},${y + r} Z`} {...common} />
}

export function AdaptationTimeline() {
  const events = useSim((s) => s.events)
  const now = useSim((s) => s.snapshot?.status.sim_time_s ?? 0)
  const selSeq = useSelection((s) => s.eventSeq)
  const [span, setSpan] = useState(600)
  const W = 900
  const lane = 30
  const P = { l: 214, r: 14, t: 8, b: 24 }
  const H = P.t + P.b + lane * RULES.length
  const t1 = Math.max(now, events.at(-1)?.sim_time_s ?? 0)
  const t0 = span ? Math.max(0, t1 - span) : Math.min(0, events[0]?.sim_time_s ?? 0)
  const x = (t: number) => P.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r)
  const visible = events.filter((e) => e.sim_time_s >= t0)
  const selected = events.find((e) => e.seq === selSeq)

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-3 text-2xs text-fg-muted">
          {(Object.keys(CLASS_STYLE) as RuleClass[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden>
                <Glyph cls={k} x={6} y={6} r={4} sel={false} />
              </svg>
              {CLASS_STYLE[k].label}
            </span>
          ))}
        </div>
        <div className="flex gap-0.5 rounded-control bg-surface-sunken p-0.5" role="radiogroup" aria-label="Timeline span">
          {SPANS.map((o) => (
            <button
              key={o.l}
              type="button"
              role="radio"
              aria-checked={span === o.s}
              onClick={() => setSpan(o.s)}
              className={cn('h-6 rounded-[0.35rem] px-2 text-2xs', span === o.s ? 'bg-intel/15 text-intel' : 'text-fg-muted hover:text-fg')}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Adaptation events over time, one lane per rule">
        {RULES.map((r, i) => {
          const y = P.t + lane * i + lane / 2
          return (
            <g key={r.id}>
              <line x1={P.l} x2={W - P.r} y1={y} y2={y} stroke="#0f2036" />
              <text x={8} y={y + 4} fontSize="11" fill="#e6eef6" className="readout">
                {r.id}
              </text>
              <text x={34} y={y + 4} fontSize="11" fill="#9fb2c6">
                {r.title}
              </text>
            </g>
          )
        })}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const t = t0 + (t1 - t0) * f
          return (
            <text key={f} x={x(t)} y={H - 6} textAnchor="middle" fontSize="10" fill="#6a8099" className="readout">
              {simClock(t).slice(0, 8)}
            </text>
          )
        })}
        <line x1={x(t1)} x2={x(t1)} y1={P.t} y2={H - P.b} stroke="rgba(70,224,255,0.4)" strokeDasharray="2 3" />
        {visible.map((e) => {
          const i = RULES.findIndex((r) => r.id === e.rule)
          if (i < 0) return null
          const y = P.t + lane * i + lane / 2
          const sel = e.seq === selSeq
          return (
            <g key={e.seq} className="cursor-pointer" onClick={() => select({ eventSeq: sel ? null : e.seq })}>
              <title>{`${e.rule} ${e.label}: ${eventValue(e.previous, e.unit)} → ${eventValue(e.new, e.unit)} at T+${simClock(e.sim_time_s)}`}</title>
              <rect x={x(e.sim_time_s) - 7} y={y - 11} width={14} height={22} fill="transparent" />
              <Glyph cls={e.rule_class as RuleClass} x={x(e.sim_time_s)} y={y} r={sel ? 6 : 4.2} sel={sel} />
            </g>
          )
        })}
      </svg>
      {selected ? <EventInspector ev={selected} /> : <p className="mt-2 text-2xs text-fg-subtle">Select an event to see what changed, why, and its pathway in the decision network.</p>}
    </div>
  )
}

export function EventInspector({ ev, compact }: { ev: AdaptationEvent; compact?: boolean }) {
  const info = RULE_BY_ID[ev.rule as keyof typeof RULE_BY_ID]
  const cls = CLASS_STYLE[ev.rule_class as RuleClass]
  return (
    <article className="mt-3 animate-rise-in rounded-card border border-intel/25 bg-intel/[0.04] p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="label-tech" style={{ color: cls?.color }}>
            Rule {ev.rule} · {cls?.label ?? ev.rule_class}
          </p>
          <h4 className="font-display text-lg font-semibold tracking-tight text-fg uppercase">{info?.title ?? ev.label}</h4>
        </div>
        <div className="flex items-center gap-2">
          <span className="readout text-2xs text-fg-subtle">
            T+{simClock(ev.sim_time_s)} · ping #{ev.ping} · {wallClock(ev.wall_time)}
          </span>
          <button type="button" onClick={() => select({ eventSeq: null })} className="rounded p-1 text-fg-subtle hover:text-fg" aria-label="Close event">
            <X className="size-3.5" />
          </button>
        </div>
      </header>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="rounded-control border border-line-strong px-3 py-1.5 readout text-base text-fg-muted">{eventValue(ev.previous, ev.unit)}</span>
        <ArrowRight className="size-4 text-intel" aria-hidden />
        <span className="rounded-control border border-intel/50 bg-intel/10 px-3 py-1.5 readout text-base text-fg shadow-[0_0_20px_-6px_#a493ff]">
          {eventValue(ev.new, ev.unit)}
        </span>
        <span className="text-xs text-fg-muted">{ev.label}</span>
        <DataTag kind="simulated" />
      </div>
      <dl className={cn('mt-3 grid gap-3 text-xs', !compact && 'md:grid-cols-2')}>
        <div>
          <dt className="label-tech">What triggered it</dt>
          <dd className="mt-0.5 readout text-fg-muted">{ev.trigger}</dd>
        </div>
        <div>
          <dt className="label-tech">Why (controller's reasoning)</dt>
          <dd className="mt-0.5 text-fg">{ev.reason}</dd>
        </div>
        {info && !compact && (
          <>
            <div>
              <dt className="label-tech">Expected result</dt>
              <dd className="mt-0.5 text-fg-muted">{info.expectation}</dd>
            </div>
            <div>
              <dt className="label-tech">Limitations</dt>
              <dd className="mt-0.5 text-fg-muted">{info.limitations.join(' ')}</dd>
            </div>
          </>
        )}
      </dl>
    </article>
  )
}
