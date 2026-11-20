import { useEffect, useRef, type ReactNode } from 'react'
import { useSim } from '../../features/sim/store'
import type { HistorySample } from '../../features/sim/types'
import { cn } from '../../lib/cn'
import { prefersReducedMotion } from '../../lib/quality'
import { observeVisibility, onTick } from '../../lib/ticker'

export type Provenance =
  | 'simulated'
  | 'calculated'
  | 'measured-sim'
  | 'assumed'
  | 'unavailable'
  | 'implemented'
  | 'approximate'
  | 'not-validated'
  | 'requires-hardware'

const TAGS: Record<Provenance, { label: string; cls: string; title: string }> = {
  simulated: { label: 'Simulated', cls: 'text-warning border-warning/30', title: 'Produced by the simulation engine' },
  calculated: { label: 'Calculated', cls: 'text-env border-env/30', title: 'Computed from other values with a documented formula' },
  'measured-sim': { label: 'Sensor (sim)', cls: 'text-acoustic border-acoustic/30', title: 'Simulated sensor measurement with assumed noise — not hardware' },
  assumed: { label: 'Assumed', cls: 'text-fg-muted border-line-strong', title: 'Placeholder parameter, not a measured or specified value' },
  unavailable: { label: 'Unavailable', cls: 'text-fg-subtle border-line', title: 'Not provided by the current model or API' },
  implemented: { label: 'Implemented', cls: 'text-success border-success/30', title: 'Implemented and tested in software' },
  approximate: { label: 'Approximate', cls: 'text-info border-info/30', title: 'Order-of-magnitude figure; verify against datasheets' },
  'not-validated': { label: 'Not yet validated', cls: 'text-warning border-warning/30', title: 'Not validated against real measurements' },
  'requires-hardware': { label: 'Requires hardware testing', cls: 'text-danger border-danger/30', title: 'Cannot be confirmed without physical hardware' },
}

export function DataTag({ kind, className }: { kind: Provenance; className?: string }) {
  const t = TAGS[kind]
  return (
    <span title={t.title} className={cn('inline-flex shrink-0 items-center rounded-full border px-1.5 py-px font-mono text-[0.5625rem] tracking-[0.12em] uppercase', t.cls, className)}>
      {t.label}
    </span>
  )
}

/** Number that eases to new values (direct DOM writes; no React re-render per frame). */
export function AnimatedNumber({ value, digits = 1, className }: { value: number | null | undefined; digits?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    if (value == null || !Number.isFinite(value)) {
      el.textContent = '—'
      shown.current = null
      return
    }
    const from = shown.current
    if (from == null || prefersReducedMotion() || Math.abs(value - from) < 10 ** -digits) {
      shown.current = value
      el.textContent = fmt(value)
      return
    }
    const t0 = performance.now()
    const dur = 420
    const stop = onTick(() => {
      // Clamp progress: frame timestamps can precede t0, and an unclamped cubic would overshoot wildly.
      const k = Math.min(1, Math.max(0, (performance.now() - t0) / dur))
      const e = 1 - (1 - k) ** 3
      const v = from + (value - from) * e
      shown.current = v
      el.textContent = fmt(v)
      if (k >= 1) stop()
    })
    return stop
  }, [value, digits])
  return <span ref={ref} className={cn('readout', className)} />
}

/** Compact trend from real history samples. */
export function Sparkline({
  field,
  color = '#46e0ff',
  seconds = 120,
  className,
}: {
  field: keyof HistorySample
  color?: string
  seconds?: number
  className?: string
}) {
  const history = useSim((s) => s.history)
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    let visible = true
    const stopVis = observeVisibility(c, (v) => (visible = v))
    const r = c.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = Math.round(r.width * dpr)
    c.height = Math.round(r.height * dpr)
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (!visible) return stopVis
    const last = history.at(-1)?.t ?? 0
    const pts = history.filter((h) => h.t >= last - seconds && h[field] != null)
    ctx.clearRect(0, 0, r.width, r.height)
    if (pts.length > 1) {
      const vals = pts.map((p) => p[field] as number)
      const lo = Math.min(...vals)
      const hi = Math.max(...vals)
      const span = hi - lo || 1
      const x = (t: number) => ((t - (last - seconds)) / seconds) * r.width
      const y = (v: number) => r.height - 2 - ((v - lo) / span) * (r.height - 4)
      const grd = ctx.createLinearGradient(0, 0, 0, r.height)
      grd.addColorStop(0, color + '40')
      grd.addColorStop(1, color + '00')
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(x(p.t), y(p[field] as number)) : ctx.moveTo(x(p.t), y(p[field] as number))))
      ctx.lineTo(x(pts.at(-1)!.t), r.height)
      ctx.lineTo(x(pts[0].t), r.height)
      ctx.fillStyle = grd
      ctx.fill()
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(x(p.t), y(p[field] as number)) : ctx.moveTo(x(p.t), y(p[field] as number))))
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.stroke()
      const lp = pts.at(-1)!
      ctx.fillStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.arc(x(lp.t), y(lp[field] as number), 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
    return stopVis
  }, [history, field, color, seconds])
  return <canvas ref={ref} className={cn('block', className)} aria-hidden />
}

/** Section title used across pages: editorial heading + technical eyebrow. */
export function SectionTitle({ eyebrow, title, children, className }: { eyebrow: string; title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <p className="label-tech text-acoustic/80">{eyebrow}</p>
        <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h2>
      </div>
      {children}
    </div>
  )
}

/** Instrument container: translucent glass with optional brackets. */
export function Instrument({
  title,
  tag,
  explain,
  children,
  className,
  bracket,
  action,
}: {
  title: string
  tag?: Provenance
  explain?: ReactNode
  children: ReactNode
  className?: string
  bracket?: boolean
  action?: ReactNode
}) {
  return (
    <section className={cn('rounded-card holo p-4', bracket && 'brackets', className)}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-display text-[0.9375rem] font-semibold tracking-tight text-fg">
            {title}
            {tag && <DataTag kind={tag} />}
          </h3>
          {explain && <p className="mt-0.5 text-xs leading-relaxed text-fg-subtle">{explain}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}
