/**
 * LiveScope — streaming scientific time-series instrument (Canvas 2D).
 *
 * Every sample comes from the simulation history; nothing is interpolated into
 * existence. The x-axis is SIMULATED time: it scrolls smoothly while the simulation
 * runs and freezes when it is paused. Interaction: hover = crosshair readout,
 * wheel = zoom time, drag = pan (leaves live mode), double-click / "Live" = follow again,
 * click an event marker = select that adaptation event everywhere in the app.
 */
import { Radio } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { simNow } from '../../features/sim/clock'
import { useSim } from '../../features/sim/store'
import type { AdaptationEvent, HistorySample } from '../../features/sim/types'
import { cn } from '../../lib/cn'
import { simClock } from '../../lib/format'
import { observeVisibility, onTick } from '../../lib/ticker'
import { getSelection, select, subscribeSelection } from '../../lib/ui-store'

export type SeriesColor = 'acoustic' | 'ref' | 'intel' | 'env'

export interface ScopeSeries {
  key: keyof HistorySample
  label: string
  color: SeriesColor
  dashed?: boolean
  area?: boolean
}

export interface ScopeThreshold {
  value: number
  label: string
  color?: SeriesColor | 'warning'
}

interface Props {
  series: ScopeSeries[]
  unit: string
  digits?: number
  height?: number
  step?: boolean
  /** Adaptation rules whose events are marked on this chart. */
  eventRules?: string[]
  /** Mark samples where this boolean field is false (e.g. missed detections). */
  missKey?: keyof HistorySample
  missLabel?: string
  thresholds?: ScopeThreshold[]
  yMin?: number
  yMax?: number
  /** Initial visible window in simulated seconds. */
  windowS?: number
  ariaLabel: string
}

const COLORS: Record<SeriesColor | 'warning', { line: string; glow: string }> = {
  acoustic: { line: '#1a9fc4', glow: '#46e0ff' },
  ref: { line: '#e0703a', glow: '#ff9a5c' },
  intel: { line: '#8a76f0', glow: '#a493ff' },
  env: { line: '#1ba585', glow: '#3fe0b5' },
  warning: { line: '#f2b54d', glow: '#f2b54d' },
}
const RULE_CLASS_COLOR: Record<string, string> = {
  physics: '#3fe0b5',
  constraint: '#66aaff',
  heuristic: '#f2b54d',
  'physics + heuristic': '#a493ff',
}
const PAD = { l: 62, r: 14, t: 14, b: 24 }

function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || 1
  const raw = span / n
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) ?? raw
  const out = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10))
  return out
}

function fmtVal(v: number, digits: number) {
  return Math.abs(v) >= 10000 ? v.toFixed(0) : v.toFixed(digits)
}

export function LiveScope({
  series,
  unit,
  digits = 1,
  height = 190,
  step,
  eventRules = [],
  missKey,
  missLabel = 'no valid echo',
  thresholds = [],
  yMin,
  yMax,
  windowS = 300,
  ariaLabel,
}: Props) {
  const history = useSim((s) => s.history)
  const events = useSim((s) => s.events)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState(true)

  // Everything the draw loop needs lives in refs: data updates never re-create the loop.
  const data = useRef({ history, events })
  const view = useRef({ live: true, end: 0, span: windowS })
  const spanRef = useRef(windowS)
  const hover = useRef<{ x: number; y: number } | null>(null)
  const markers = useRef<{ x: number; ev: AdaptationEvent }[]>([])
  const dirty = useRef(true)
  const cfg = useRef({ series, unit, digits, step, eventRules, missKey, missLabel, thresholds, yMin, yMax })

  useEffect(() => {
    data.current = { history, events }
    dirty.current = true
  }, [history, events])
  useEffect(() => {
    cfg.current = { series, unit, digits, step, eventRules, missKey, missLabel, thresholds, yMin, yMax }
    dirty.current = true
  })
  useEffect(() => subscribeSelection(() => (dirty.current = true)), [])

  const goLive = () => {
    view.current.live = true
    view.current.span = windowS
    setLive(true)
    dirty.current = true
  }

  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    const ctx = canvas.getContext('2d')!
    let w = 0
    let h = 0
    let visible = true
    const resize = () => {
      const r = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width
      h = r.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      dirty.current = true
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()
    const stopVis = observeVisibility(wrap, (v) => {
      visible = v
      dirty.current = true
    })

    const draw = () => {
      const { history: hist } = data.current
      const c = cfg.current
      const v = view.current
      const now = simNow()
      if (v.live) v.end = Math.max(now, hist.at(-1)?.t ?? 0)
      const t1 = v.end
      // Early in a run, fit the data instead of leaving most of the window empty.
      const first = hist[0]?.t ?? t1 - v.span
      const t0 = v.live ? Math.max(t1 - v.span, Math.min(first, t1 - 10)) : t1 - v.span
      const iw = w - PAD.l - PAD.r
      const ih = h - PAD.t - PAD.b
      const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * iw

      ctx.clearRect(0, 0, w, h)
      // visible slice (+1 sample either side for continuity)
      let i0 = hist.findIndex((s) => s.t >= t0)
      if (i0 < 0) i0 = hist.length
      i0 = Math.max(0, i0 - 1)
      let i1 = hist.length
      for (let i = hist.length - 1; i >= 0; i--) if (hist[i].t <= t1) {
        i1 = Math.min(hist.length, i + 2)
        break
      }
      const slice = hist.slice(i0, i1)

      // y-range from visible data
      let lo = Infinity
      let hi = -Infinity
      for (const s of slice)
        for (const sr of c.series) {
          const val = s[sr.key] as number | null
          if (val != null && Number.isFinite(val)) {
            lo = Math.min(lo, val)
            hi = Math.max(hi, val)
          }
        }
      for (const th of c.thresholds) {
        lo = Math.min(lo, th.value)
        hi = Math.max(hi, th.value)
      }
      if (!Number.isFinite(lo)) {
        lo = 0
        hi = 1
      }
      const padY = (hi - lo || Math.abs(hi) * 0.1 || 1) * 0.12
      lo = c.yMin ?? lo - padY
      hi = c.yMax ?? hi + padY
      const y = (val: number) => PAD.t + (1 - (val - lo) / (hi - lo)) * ih

      // grid + axes
      ctx.font = '10px "JetBrains Mono", monospace'
      ctx.lineWidth = 1
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      for (const tv of niceTicks(lo, hi, Math.max(2, Math.floor(ih / 38)))) {
        const yy = Math.round(y(tv)) + 0.5
        ctx.strokeStyle = 'rgba(120,170,220,0.08)'
        ctx.beginPath()
        ctx.moveTo(PAD.l, yy)
        ctx.lineTo(w - PAD.r, yy)
        ctx.stroke()
        ctx.fillStyle = '#6a8099'
        ctx.fillText(fmtVal(tv, c.digits > 1 ? 1 : c.digits), PAD.l - 8, yy)
      }
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const tStep = niceTicks(t0, t1, Math.max(2, Math.floor(iw / 90)))
      for (const tv of tStep) {
        const xx = Math.round(x(tv)) + 0.5
        ctx.strokeStyle = 'rgba(120,170,220,0.05)'
        ctx.beginPath()
        ctx.moveTo(xx, PAD.t)
        ctx.lineTo(xx, PAD.t + ih)
        ctx.stroke()
        ctx.fillStyle = '#6a8099'
        if (tv >= 0) ctx.fillText(simClock(tv).slice(3, 8), xx, PAD.t + ih + 7)
      }
      ctx.save()
      ctx.translate(9, PAD.t + ih / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#6a8099'
      ctx.fillText(c.unit, 0, 0)
      ctx.restore()

      // thresholds
      for (const th of c.thresholds) {
        const col = COLORS[th.color ?? 'warning']
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = col.line
        ctx.globalAlpha = 0.8
        ctx.beginPath()
        ctx.moveTo(PAD.l, y(th.value))
        ctx.lineTo(w - PAD.r, y(th.value))
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = col.glow
        ctx.fillText(th.label, w - PAD.r - 2, y(th.value) - 3)
      }

      // event markers
      markers.current = []
      const sel = getSelection().eventSeq
      if (c.eventRules.length) {
        const inView = data.current.events.filter((ev) => c.eventRules.includes(ev.rule) && ev.sim_time_s >= t0 && ev.sim_time_s <= t1)
        const sparse = inView.length <= 24
        for (const ev of data.current.events) {
          if (!c.eventRules.includes(ev.rule) || ev.sim_time_s < t0 || ev.sim_time_s > t1) continue
          const xx = x(ev.sim_time_s)
          const col = RULE_CLASS_COLOR[ev.rule_class] ?? '#a493ff'
          const isSel = sel === ev.seq
          ctx.strokeStyle = col
          if (sparse || isSel) {
            ctx.globalAlpha = isSel ? 0.9 : 0.3
            ctx.lineWidth = isSel ? 2 : 1
            ctx.beginPath()
            ctx.moveTo(xx, PAD.t + 10)
            ctx.lineTo(xx, PAD.t + ih)
            ctx.stroke()
          }
          ctx.globalAlpha = 1
          ctx.fillStyle = col
          ctx.beginPath()
          ctx.moveTo(xx, PAD.t + 1)
          ctx.lineTo(xx + 4, PAD.t + 7)
          ctx.lineTo(xx, PAD.t + 11)
          ctx.lineTo(xx - 4, PAD.t + 7)
          ctx.closePath()
          ctx.fill()
          markers.current.push({ x: xx, ev })
        }
        ctx.lineWidth = 1
      }

      // decimation: keep min/max per pixel column when the slice is dense
      const cols = Math.max(1, Math.floor(iw))
      const dense = slice.length > cols * 1.5

      ctx.save()
      ctx.beginPath()
      ctx.rect(PAD.l, PAD.t, iw, ih)
      ctx.clip()
      c.series.forEach((sr, si) => {
        const col = COLORS[sr.color]
        const pts: [number, number][] = []
        let gap = false
        const segs: [number, number][][] = []
        const push = (px: number, py: number) => {
          if (gap) {
            if (pts.length) segs.push(pts.splice(0))
            gap = false
          }
          pts.push([px, py])
        }
        if (dense) {
          const buckets = new Map<number, { min: number; max: number }>()
          for (const s of slice) {
            const val = s[sr.key] as number | null
            if (val == null) continue
            const bx = Math.floor(x(s.t))
            const b = buckets.get(bx)
            if (b) {
              b.min = Math.min(b.min, val)
              b.max = Math.max(b.max, val)
            } else buckets.set(bx, { min: val, max: val })
          }
          for (const [bx, b] of [...buckets.entries()].sort((a, z) => a[0] - z[0])) {
            push(bx, y(b.max))
            if (b.min !== b.max) push(bx, y(b.min))
          }
        } else {
          let prevY: number | null = null
          for (const s of slice) {
            const val = s[sr.key] as number | null
            if (val == null || !Number.isFinite(val)) {
              gap = true
              prevY = null
              continue
            }
            const px = x(s.t)
            const py = y(val)
            if (c.step && prevY != null) push(px, prevY)
            push(px, py)
            prevY = py
          }
        }
        if (pts.length) segs.push(pts)

        for (const seg of segs) {
          if (sr.area && si === 0 && seg.length > 1) {
            const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + ih)
            grad.addColorStop(0, col.glow + '33')
            grad.addColorStop(1, col.glow + '00')
            ctx.fillStyle = grad
            ctx.beginPath()
            ctx.moveTo(seg[0][0], PAD.t + ih)
            for (const [px, py] of seg) ctx.lineTo(px, py)
            ctx.lineTo(seg[seg.length - 1][0], PAD.t + ih)
            ctx.closePath()
            ctx.fill()
          }
          ctx.strokeStyle = col.line
          ctx.lineWidth = 2
          ctx.lineJoin = 'round'
          ctx.setLineDash(sr.dashed ? [6, 4] : [])
          ctx.beginPath()
          seg.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
          ctx.stroke()
          ctx.setLineDash([])
        }
        // glowing head sample (latest real sample)
        const last = [...slice].reverse().find((s) => s[sr.key] != null)
        if (last && v.live) {
          const px = x(last.t)
          const py = y(last[sr.key] as number)
          ctx.shadowColor = col.glow
          ctx.shadowBlur = 12
          ctx.fillStyle = col.glow
          ctx.beginPath()
          ctx.arc(px, py, 3.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
        }
      })

      // missed detections
      if (c.missKey) {
        ctx.fillStyle = '#f2b54d'
        for (const s of slice) {
          if (s[c.missKey] === false) {
            const px = x(s.t)
            ctx.fillRect(px - 0.75, PAD.t + ih - 6, 1.5, 6)
          }
        }
      }
      ctx.restore()

      // crosshair + tooltip
      const hv = hover.current
      const tip = tipRef.current
      if (hv && slice.length && tip && hv.x >= PAD.l && hv.x <= w - PAD.r) {
        const tAt = t0 + ((hv.x - PAD.l) / iw) * (t1 - t0)
        let best = slice[0]
        for (const s of slice) if (Math.abs(s.t - tAt) < Math.abs(best.t - tAt)) best = s
        const px = x(best.t)
        ctx.strokeStyle = 'rgba(230,238,246,0.35)'
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.moveTo(px, PAD.t)
        ctx.lineTo(px, PAD.t + ih)
        ctx.stroke()
        ctx.setLineDash([])
        const lines = c.series.map((sr) => {
          const val = best[sr.key] as number | null
          if (val != null) {
            ctx.fillStyle = COLORS[sr.color].glow
            ctx.beginPath()
            ctx.arc(px, y(val), 3, 0, Math.PI * 2)
            ctx.fill()
          }
          return `<div style="display:flex;gap:8px;align-items:center"><span style="width:8px;height:2px;background:${COLORS[sr.color].glow}"></span><span style="color:#9fb2c6">${sr.label}</span><b style="margin-left:auto;font-weight:500">${val == null ? '—' : fmtVal(val, c.digits)} ${c.unit}</b></div>`
        })
        const near = markers.current.find((m) => Math.abs(m.x - hv.x) < 6)
        const evLine = near
          ? `<div style="margin-top:4px;color:#a493ff">${near.ev.rule} · ${near.ev.label} (click to inspect)</div>`
          : ''
        const miss = c.missKey && best[c.missKey] === false ? `<div style="color:#f2b54d">${c.missLabel}</div>` : ''
        tip.innerHTML = `<div style="color:#6a8099">T+${simClock(best.t)} · ping #${best.ping_count}</div>${lines.join('')}${miss}${evLine}`
        tip.style.display = 'block'
        const left = px + 14 + 200 > w ? px - 214 : px + 14
        tip.style.transform = `translate(${left}px, ${Math.max(4, hv.y - 30)}px)`
        canvas.style.cursor = near ? 'pointer' : 'crosshair'
      } else if (tip) {
        tip.style.display = 'none'
      }
    }

    const stop = onTick(() => {
      if (!visible) return
      const running = view.current.live
      if (running || dirty.current || hover.current) {
        draw()
        dirty.current = false
      }
    })

    // interaction
    let drag: { x: number; end: number } | null = null
    const rect = () => canvas.getBoundingClientRect()
    const onMove = (e: PointerEvent) => {
      const r = rect()
      hover.current = { x: e.clientX - r.left, y: e.clientY - r.top }
      if (drag) {
        const iw = w - PAD.l - PAD.r
        view.current.end = drag.end - ((e.clientX - drag.x) / iw) * view.current.span
      }
      dirty.current = true
    }
    const onLeave = () => {
      hover.current = null
      drag = null
      dirty.current = true
    }
    const onDown = (e: PointerEvent) => {
      const r = rect()
      const mx = e.clientX - r.left
      const hit = markers.current.find((m) => Math.abs(m.x - mx) < 6)
      if (hit) {
        select({ eventSeq: hit.ev.seq })
        return
      }
      drag = { x: e.clientX, end: view.current.end }
      if (view.current.live) {
        view.current.live = false
        setLive(false)
      }
    }
    const onUp = () => (drag = null)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = rect()
      const iw = w - PAD.l - PAD.r
      const frac = Math.min(1, Math.max(0, (e.clientX - r.left - PAD.l) / iw))
      const v = view.current
      const t0 = v.end - v.span
      const tAt = t0 + frac * v.span
      const span = Math.min(7200, Math.max(10, v.span * (e.deltaY > 0 ? 1.2 : 1 / 1.2)))
      v.span = span
      if (!v.live) v.end = tAt + (1 - frac) * span
      dirty.current = true
    }
    const onDbl = () => {
      view.current.live = true
      view.current.span = spanRef.current
      setLive(true)
      dirty.current = true
    }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('dblclick', onDbl)
    return () => {
      stop()
      stopVis()
      ro.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('dblclick', onDbl)
    }
  }, [])

  const empty = history.length < 2

  return (
    <div className="relative">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.length > 1 &&
          series.map((s) => (
            <span key={String(s.key)} className="flex items-center gap-1.5 text-2xs text-fg-muted">
              <span
                className="h-0.5 w-4 rounded-full"
                style={{
                  background: s.dashed
                    ? `repeating-linear-gradient(90deg, ${COLORS[s.color].glow} 0 4px, transparent 4px 7px)`
                    : COLORS[s.color].glow,
                }}
                aria-hidden
              />
              {s.label}
            </span>
          ))}
        {missKey && (
          <span className="flex items-center gap-1.5 text-2xs text-fg-muted">
            <span className="h-2 w-0.5 bg-warning" aria-hidden />
            {missLabel}
          </span>
        )}
        {eventRules.length > 0 && (
          <span className="flex items-center gap-1.5 text-2xs text-fg-muted">
            <span className="size-1.5 rotate-45 bg-intel" aria-hidden />
            {eventRules.join('/')} events
          </span>
        )}
        <button
          type="button"
          onClick={goLive}
          className={cn(
            'ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 label-tech transition-colors',
            live ? 'bg-acoustic/10 text-acoustic' : 'bg-surface-hover text-fg-muted hover:text-fg',
          )}
          title={live ? 'Following live data. Drag to pan, wheel to zoom.' : 'Return to live view'}
        >
          <Radio className={cn('size-3', live && 'animate-pulse-soft')} aria-hidden /> {live ? 'Live' : 'Go live'}
        </button>
      </div>
      <div ref={wrapRef} className="relative" style={{ height }}>
        <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" role="img" aria-label={ariaLabel} />
        <div
          ref={tipRef}
          className="pointer-events-none absolute top-0 left-0 z-10 hidden w-[200px] rounded-control border border-line-strong bg-[rgba(4,11,22,0.94)] px-2.5 py-2 readout text-2xs text-fg shadow-elevated"
        />
        {empty && (
          <div className="absolute inset-0 grid place-items-center label-tech">Awaiting simulation data</div>
        )}
      </div>
    </div>
  )
}
