/**
 * Oscilloscope-style instruments (Canvas 2D):
 *   Oscilloscope   transmit pulse — engine display model or reference-DSP DAC codes
 *   ReceiverScope  simulated matched-filter envelope (A-scan) with phosphor persistence
 *   PingTimeline   each system's real transmission schedule, listening windows, echo arrivals
 *   ProfileScope   sound speed vs depth observed during this run
 */
import { useEffect, useRef, useState } from 'react'
import { simNow } from '../../features/sim/clock'
import { simApi } from '../../features/sim/simApi'
import { useSim } from '../../features/sim/store'
import type { ReferencePulse, Snapshot } from '../../features/sim/types'
import { cn } from '../../lib/cn'
import { num, pulse } from '../../lib/format'
import { observeVisibility, onTick } from '../../lib/ticker'

function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[], animate = false) {
  const ref = useRef<HTMLCanvasElement>(null)
  const fn = useRef(draw)
  useEffect(() => {
    fn.current = draw
  })
  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    let w = 0
    let h = 0
    let visible = true
    let dirty = true
    const resize = () => {
      const r = c.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = r.width
      h = r.height
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      dirty = true
    }
    const ro = new ResizeObserver(resize)
    ro.observe(c)
    resize()
    const stopVis = observeVisibility(c, (v) => (visible = v))
    const stop = onTick(() => {
      if (!visible || (!animate && !dirty) || w < 10) return
      fn.current(ctx, w, h)
      dirty = false
    })
    ;(c as unknown as { __dirty: () => void }).__dirty = () => (dirty = true)
    return () => {
      stop()
      stopVis()
      ro.disconnect()
    }
  }, [animate])
  useEffect(() => {
    const c = ref.current as unknown as { __dirty?: () => void } | null
    c?.__dirty?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return ref
}

function grid(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, nx = 10, ny = 8) {
  ctx.strokeStyle = 'rgba(70,224,255,0.07)'
  ctx.lineWidth = 1
  for (let i = 0; i <= nx; i++) {
    const x = Math.round(x0 + (w * i) / nx) + 0.5
    ctx.beginPath()
    ctx.moveTo(x, y0)
    ctx.lineTo(x, y0 + h)
    ctx.stroke()
  }
  for (let j = 0; j <= ny; j++) {
    const y = Math.round(y0 + (h * j) / ny) + 0.5
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x0 + w, y)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(70,224,255,0.16)'
  ctx.beginPath()
  ctx.moveTo(x0, y0 + h / 2)
  ctx.lineTo(x0 + w, y0 + h / 2)
  ctx.moveTo(x0 + w / 2, y0)
  ctx.lineTo(x0 + w / 2, y0 + h)
  ctx.stroke()
}

/* ------------------------------------------------------------------------ */
export function Oscilloscope({ snap, height = 230 }: { snap: Snapshot; height?: number }) {
  const [mode, setMode] = useState<'model' | 'dac'>('model')
  const [ref, setRef] = useState<ReferencePulse | null>(null)
  const [refErr, setRefErr] = useState<string | null>(null)
  const tx = snap.transmission.current
  const wf = snap.sonar.waveform
  const key = `${tx.frequency_khz}|${tx.pulse_duration_ms}|${tx.waveform}|${tx.bandwidth_khz}`
  const prev = useRef<{ key: string; samples: number[] }[]>([])
  const changedAt = useRef(0)

  useEffect(() => {
    if (mode !== 'dac') return
    let alive = true
    simApi
      .referencePulse()
      .then((r) => alive && (setRef(r), setRefErr(null)))
      .catch(() => alive && setRefErr('Reference pulse unavailable'))
    return () => {
      alive = false
    }
  }, [mode, key])

  useEffect(() => {
    const p = prev.current
    if (p.at(-1)?.key !== key) {
      p.push({ key, samples: wf.samples })
      if (p.length > 4) p.shift()
      changedAt.current = performance.now()
    }
  }, [key, wf.samples])

  const canvas = useCanvas(
    (ctx, w, h) => {
      const P = { l: 8, r: 8, t: 8, b: 22 }
      const iw = w - P.l - P.r
      const ih = h - P.t - P.b
      ctx.clearRect(0, 0, w, h)
      grid(ctx, P.l, P.t, iw, ih)
      const age = (performance.now() - changedAt.current) / 1000
      const drawTrace = (samples: number[], color: string, alpha: number, glow: boolean, step = false) => {
        ctx.globalAlpha = alpha
        ctx.strokeStyle = color
        ctx.lineWidth = 1.4
        if (glow) {
          ctx.shadowColor = color
          ctx.shadowBlur = 8
        }
        ctx.beginPath()
        samples.forEach((v, i) => {
          const x = P.l + (i / (samples.length - 1)) * iw
          const y = P.t + ((1 - v) / 2) * ih
          if (i === 0) ctx.moveTo(x, y)
          else if (step) {
            const px = P.l + ((i - 1) / (samples.length - 1)) * iw
            ctx.lineTo(x, P.t + ((1 - samples[i - 1]) / 2) * ih)
            void px
            ctx.lineTo(x, y)
          } else ctx.lineTo(x, y)
        })
        ctx.stroke()
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1
      }
      if (mode === 'model') {
        // phosphor afterglow of previous settings (real previous traces) for 1.5 s after a change
        const p = prev.current
        p.slice(0, -1).forEach((tr, i) => {
          const a = Math.max(0, 0.35 - age * 0.25) * ((i + 1) / p.length)
          if (a > 0.01) drawTrace(tr.samples, '#a493ff', a, false)
        })
        drawTrace(wf.samples, '#46e0ff', 1, true)
        // documented envelope: 10 % Tukey taper over [0, τ] (same definition as build_waveform)
        const n = wf.samples.length
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = 'rgba(63,224,181,0.7)'
        for (const sign of [1, -1]) {
          ctx.beginPath()
          for (let i = 0; i < n; i++) {
            const t = (i / (n - 1)) * wf.window_ms - wf.lead_ms
            const x01 = t / tx.pulse_duration_ms
            let env = 0
            if (x01 >= 0 && x01 <= 1) env = x01 < 0.1 ? 0.5 * (1 - Math.cos((Math.PI * x01) / 0.1)) : x01 > 0.9 ? 0.5 * (1 - Math.cos((Math.PI * (1 - x01)) / 0.1)) : 1
            const x = P.l + (i / (n - 1)) * iw
            const y = P.t + ((1 - sign * env) / 2) * ih
            if (i) ctx.lineTo(x, y)
            else ctx.moveTo(x, y)
          }
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.fillStyle = '#6a8099'
        ctx.font = '10px "JetBrains Mono", monospace'
        ctx.textAlign = 'left'
        ctx.fillText(`${num(wf.window_ms / 10, 3)} ms/div`, P.l, h - 6)
        ctx.textAlign = 'right'
        ctx.fillText(wf.time_compressed ? `carrier drawn ${wf.display_time_compression}× slower` : `${num(wf.carrier_cycles, 0)} cycles shown`, w - P.r, h - 6)
      } else if (ref) {
        const full = (1 << ref.bits) - 1
        const s = ref.codes.map((c) => (c / full) * 2 - 1)
        drawTrace(s, '#a493ff', 1, true, true)
        ctx.fillStyle = '#6a8099'
        ctx.font = '10px "JetBrains Mono", monospace'
        ctx.textAlign = 'left'
        ctx.fillText(`${(ref.sample_rate_hz / 1000).toFixed(0)} kS/s · ${ref.bits}-bit · ${ref.total_samples} samples${ref.decimation > 1 ? ` (every ${ref.decimation}th drawn)` : ''}`, P.l, h - 6)
        ctx.textAlign = 'right'
        ctx.fillText(`${num(ref.samples_per_cycle, 1)} samples/cycle`, w - P.r, h - 6)
      }
    },
    [key, mode, ref, wf.samples],
    true,
  )

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-control bg-surface-sunken p-0.5" role="radiogroup" aria-label="Oscilloscope source">
          {(
            [
              ['model', 'Engine display model'],
              ['dac', 'Reference DSP · DAC codes'],
            ] as const
          ).map(([m, l]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn('h-7 rounded-[0.4rem] px-2.5 text-2xs font-medium', mode === m ? 'bg-acoustic/15 text-acoustic' : 'text-fg-muted hover:text-fg')}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="readout text-2xs text-fg-muted">
          {tx.waveform === 'LFM' ? `LFM ${num(wf.start_khz, 1)} → ${num(wf.end_khz, 1)} kHz` : `CW ${tx.frequency_khz} kHz`} · {pulse(tx.pulse_duration_ms)}
        </span>
      </div>
      <div className="relative rounded-control border border-line bg-[#020a14]" style={{ height }}>
        <canvas ref={canvas} className="absolute inset-0 size-full" role="img" aria-label="Transmit pulse oscilloscope" />
        {mode === 'dac' && !ref && <p className="absolute inset-0 grid place-items-center label-tech">{refErr ?? 'Rendering reference pulse…'}</p>}
      </div>
      <p className="mt-1.5 text-2xs text-fg-subtle">
        {mode === 'model'
          ? 'Display model from the simulation engine (app/sonar/sonar.py). Dashed teal: 10 % Tukey amplitude envelope. Violet ghosts: previous settings after a change.'
          : 'Output of the reference DSP (app/sonar/dsp.py) for the current settings: 12-bit DAC codes at the rate a DAC-driven transmitter would need. Calculated, not captured from hardware.'}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
export function ReceiverScope({ snap, height = 230 }: { snap: Snapshot; height?: number }) {
  const scan = snap.sonar.ascan
  const hist = useRef<NonNullable<typeof scan>[]>([])
  useEffect(() => {
    if (!scan) return
    const h = hist.current
    if (h.at(-1) !== scan) {
      h.push(scan)
      if (h.length > 4) h.shift()
    }
  }, [scan])
  const c = snap.environment.sound_speed_m_s
  const dt = snap.sonar.transducer.detection_threshold_db
  const ping = snap.primary.last_ping
  const canvas = useCanvas(
    (ctx, w, h) => {
      const P = { l: 36, r: 10, t: 10, b: 34 }
      const iw = w - P.l - P.r
      const ih = h - P.t - P.b
      ctx.clearRect(0, 0, w, h)
      if (!scan) return
      const lo = -10
      const hi = 50
      const x = (r: number) => P.l + (r / scan.max_range_m) * iw
      const y = (v: number) => P.t + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * ih
      ctx.font = '10px "JetBrains Mono", monospace'
      for (const v of [0, 10, 20, 30, 40]) {
        ctx.strokeStyle = 'rgba(120,170,220,0.07)'
        ctx.beginPath()
        ctx.moveTo(P.l, y(v))
        ctx.lineTo(w - P.r, y(v))
        ctx.stroke()
        ctx.fillStyle = '#6a8099'
        ctx.textAlign = 'right'
        ctx.fillText(String(v), P.l - 6, y(v) + 3)
      }
      // blind zone
      ctx.fillStyle = 'rgba(242,107,107,0.14)'
      ctx.fillRect(P.l, P.t, Math.max(2, x(scan.blind_range_m) - P.l), ih)
      // noise floor (mean noise power = 0 dB by construction)
      ctx.strokeStyle = 'rgba(159,178,198,0.5)'
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(P.l, y(0))
      ctx.lineTo(w - P.r, y(0))
      ctx.stroke()
      ctx.strokeStyle = '#f2b54d'
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.moveTo(P.l, y(dt))
      ctx.lineTo(w - P.r, y(dt))
      ctx.stroke()
      ctx.setLineDash([])
      ctx.textAlign = 'right'
      ctx.fillStyle = '#f2b54d'
      ctx.fillText(`threshold ${dt} dB`, w - P.r, y(dt) - 4)
      ctx.fillStyle = '#9fb2c6'
      ctx.fillText('noise floor', w - P.r, y(0) - 4)
      // phosphor persistence: previous real scans fade
      hist.current.forEach((s, k) => {
        const last = k === hist.current.length - 1
        const n = s.values.length
        ctx.globalAlpha = last ? 1 : 0.12 + 0.12 * k
        ctx.strokeStyle = last ? '#46e0ff' : '#1a9fc4'
        ctx.lineWidth = last ? 1.5 : 1
        if (last) {
          ctx.shadowColor = '#46e0ff'
          ctx.shadowBlur = 6
        }
        ctx.beginPath()
        s.values.forEach((v, i) => {
          const xx = P.l + ((i + 0.5) / n) * iw
          if (i) ctx.lineTo(xx, y(v))
          else ctx.moveTo(xx, y(v))
        })
        ctx.stroke()
        ctx.shadowBlur = 0
      })
      ctx.globalAlpha = 1
      // primary echo marker at its APPARENT range (folded if ambiguous)
      if (ping && ping.apparent_range_m != null && ping.apparent_range_m <= scan.max_range_m) {
        const xx = x(ping.apparent_range_m)
        const col = ping.status === 'detected' ? '#46e0ff' : ping.status === 'ambiguous' ? '#a493ff' : '#f2b54d'
        ctx.strokeStyle = col
        ctx.setLineDash([2, 3])
        ctx.beginPath()
        ctx.moveTo(xx, P.t)
        ctx.lineTo(xx, P.t + ih)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = col
        ctx.textAlign = xx > w - 160 ? 'right' : 'left'
        ctx.fillText(`T-01 ${ping.status.replace(/_/g, ' ')} ${ping.snr_db.toFixed(1)} dB`, xx + (xx > w - 160 ? -5 : 5), P.t + 10)
      }
      // axes: range and echo time
      ctx.fillStyle = '#6a8099'
      ctx.textAlign = 'center'
      for (let k = 0; k <= 4; k++) {
        const r = (scan.max_range_m * k) / 4
        const xx = x(r)
        ctx.fillText(`${Math.round(r)} m`, xx, h - 18)
        ctx.fillStyle = '#4b6078'
        ctx.fillText(`${((2 * r) / c * 1000).toFixed(0)} ms`, xx, h - 5)
        ctx.fillStyle = '#6a8099'
      }
    },
    [scan, ping],
  )
  return (
    <div>
      <div className="relative rounded-control border border-line bg-[#020a14]" style={{ height }}>
        <canvas ref={canvas} className="absolute inset-0 size-full" role="img" aria-label="Received echo envelope" />
        {!scan && <p className="absolute inset-0 grid place-items-center label-tech">No reception yet — start the simulation</p>}
      </div>
      <p className="mt-1.5 text-2xs text-fg-subtle">
        Simulated matched-filter envelope along the tracking beam (dB above mean noise power, Rayleigh noise), not sampled ADC data. Lower axis: two-way travel time t = 2R/c at {num(c, 1)} m/s. Red: receiver blanked during transmission. Fading traces: previous pings.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
const LANE_COLOR: Record<string, string> = { adaptive: '#46e0ff', fixed_a: '#ff9a5c', fixed_a_c: '#ffb98a', fixed_b: '#e0703a' }

export function PingTimeline({ snap, windowS = 14 }: { snap: Snapshot; windowS?: number }) {
  const systems = snap.comparison.systems
  const data = useRef(systems)
  useEffect(() => {
    data.current = systems
  }, [systems])
  const canvas = useCanvas(
    (ctx, w, h) => {
      const sys = data.current
      const P = { l: 110, r: 10, t: 6, b: 22 }
      const iw = w - P.l - P.r
      const laneH = (h - P.t - P.b) / Math.max(1, sys.length)
      const now = simNow()
      const t0 = now - windowS
      const x = (t: number) => P.l + ((t - t0) / windowS) * iw
      ctx.clearRect(0, 0, w, h)
      ctx.font = '10px "JetBrains Mono", monospace'
      // time axis
      ctx.fillStyle = '#6a8099'
      ctx.textAlign = 'center'
      for (let s = Math.ceil(t0); s <= now; s += 2) {
        const xx = x(s)
        ctx.strokeStyle = 'rgba(120,170,220,0.06)'
        ctx.beginPath()
        ctx.moveTo(xx, P.t)
        ctx.lineTo(xx, h - P.b)
        ctx.stroke()
        ctx.fillText(`${(s - now).toFixed(0)} s`, xx, h - 7)
      }
      sys.forEach((s, li) => {
        const y0 = P.t + li * laneH
        const mid = y0 + laneH / 2
        const col = LANE_COLOR[s.id] ?? '#cfdbe7'
        ctx.textAlign = 'right'
        ctx.fillStyle = s.kind === 'adaptive' ? '#e6eef6' : '#9fb2c6'
        ctx.fillText(s.id === 'adaptive' ? 'Adaptive' : s.id === 'fixed_a' ? 'Fixed A' : s.id === 'fixed_a_c' ? 'Fixed A + c' : 'Fixed B', P.l - 10, mid + 3)
        ctx.strokeStyle = 'rgba(120,170,220,0.08)'
        ctx.beginPath()
        ctx.moveTo(P.l, y0 + laneH - 0.5)
        ctx.lineTo(w - P.r, y0 + laneH - 0.5)
        ctx.stroke()
        for (const p of s.recent_pings) {
          const T = p.interval_ms / 1000
          if (p.t + T + 4 < t0 || p.t > now) continue
          // listening window
          const xa = Math.max(P.l, x(p.t))
          const xb = Math.min(w - P.r, x(Math.min(p.t + T, now)))
          if (xb > xa) {
            ctx.fillStyle = col + '14'
            ctx.fillRect(xa, mid - laneH * 0.28, xb - xa, laneH * 0.56)
          }
          // transmission (pulse width exaggerated to ≥ 2 px)
          if (x(p.t) >= P.l) {
            ctx.fillStyle = col
            ctx.fillRect(x(p.t) - 1, mid - laneH * 0.36, Math.max(2, (p.pulse_ms / 1000 / windowS) * iw), laneH * 0.72)
          }
          // echo arrival at t + true two-way time
          const ta = p.t + p.true_echo_time_ms / 1000
          if (ta <= now && x(ta) >= P.l) {
            const late = p.true_echo_time_ms > p.interval_ms
            const ec = p.status === 'detected' ? '#46e0ff' : p.status === 'ambiguous' ? '#a493ff' : '#f2b54d'
            ctx.strokeStyle = ec
            ctx.fillStyle = ec
            ctx.beginPath()
            ctx.moveTo(x(ta), mid - laneH * 0.3)
            ctx.lineTo(x(ta) + 4, mid)
            ctx.lineTo(x(ta), mid + laneH * 0.3)
            ctx.lineTo(x(ta) - 4, mid)
            ctx.closePath()
            if (p.status === 'detected' || p.status === 'ambiguous') ctx.fill()
            else ctx.stroke()
            if (late) {
              ctx.fillStyle = '#a493ff'
              ctx.textAlign = 'left'
              ctx.fillText('late', x(ta) + 6, mid - laneH * 0.18)
            }
          }
        }
      })
    },
    [systems],
    true,
  )
  return (
    <div>
      <div className="relative" style={{ height: 40 + systems.length * 34 }}>
        <canvas ref={canvas} className="absolute inset-0 size-full" role="img" aria-label="Ping schedule timeline" />
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-fg-subtle">
        <span><span className="mr-1 inline-block h-2.5 w-1 bg-acoustic align-middle" />transmission</span>
        <span><span className="mr-1 inline-block h-2.5 w-5 bg-acoustic/15 align-middle" />listening window (interval)</span>
        <span>◆ echo detected</span>
        <span>◇ <span className="text-warning">echo below threshold</span></span>
        <span className="text-intel">◆ late echo → lands in the next window (range ambiguous)</span>
        <span>Each system pings on its own interval · last {windowS} s of simulated time</span>
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
export function ProfileScope({ height = 240 }: { height?: number }) {
  const history = useSim((s) => s.history)
  const canvas = useCanvas(
    (ctx, w, h) => {
      const P = { l: 44, r: 12, t: 10, b: 28 }
      const iw = w - P.l - P.r
      const ih = h - P.t - P.b
      ctx.clearRect(0, 0, w, h)
      if (history.length < 2) return
      const cs = history.map((p) => p.sound_speed_m_s)
      const ds = history.map((p) => p.depth_m)
      const c0 = Math.floor(Math.min(...cs) - 2)
      const c1 = Math.ceil(Math.max(...cs) + 2)
      const d1 = Math.max(50, Math.ceil(Math.max(...ds) / 50) * 50)
      const x = (c: number) => P.l + ((c - c0) / (c1 - c0)) * iw
      const y = (d: number) => P.t + (d / d1) * ih
      ctx.font = '10px "JetBrains Mono", monospace'
      ctx.fillStyle = '#6a8099'
      for (let k = 0; k <= 4; k++) {
        const d = (d1 * k) / 4
        ctx.strokeStyle = 'rgba(120,170,220,0.07)'
        ctx.beginPath()
        ctx.moveTo(P.l, y(d))
        ctx.lineTo(w - P.r, y(d))
        ctx.stroke()
        ctx.textAlign = 'right'
        ctx.fillText(`${Math.round(d)}`, P.l - 6, y(d) + 3)
        const c = c0 + ((c1 - c0) * k) / 4
        ctx.textAlign = 'center'
        ctx.fillText(c.toFixed(0), x(c), h - 8)
      }
      ctx.textAlign = 'left'
      ctx.fillText('depth (m) ↓', 2, P.t + 2)
      ctx.textAlign = 'right'
      ctx.fillText('sound speed (m/s) →', w - P.r, h - 18)
      history.forEach((p, i) => {
        const a = 0.15 + 0.6 * (i / history.length)
        ctx.fillStyle = `rgba(63,224,181,${a})`
        ctx.beginPath()
        ctx.arc(x(p.sound_speed_m_s), y(p.depth_m), 2, 0, Math.PI * 2)
        ctx.fill()
      })
      const last = history.at(-1)!
      ctx.fillStyle = '#3fe0b5'
      ctx.shadowColor = '#3fe0b5'
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.arc(x(last.sound_speed_m_s), y(last.depth_m), 4.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    },
    [history],
  )
  return (
    <div>
      <div className="relative" style={{ height }}>
        <canvas ref={canvas} className="absolute inset-0 size-full" role="img" aria-label="Observed sound-speed profile" />
        {history.length < 2 && <p className="absolute inset-0 grid place-items-center label-tech">Profile builds as the vehicle changes depth</p>}
      </div>
      <p className="mt-1 text-2xs text-fg-subtle">
        Each dot: one frame at the vehicle's depth (newer = brighter). This is the sound speed the vehicle has passed through — not a full-column profile; the model uses only the value at the current depth.
      </p>
    </div>
  )
}
