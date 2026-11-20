/**
 * Plan-position indicator (top-down scan display), drawn on a canvas.
 *
 * Everything drawn is derived from the backend snapshot:
 *  - sweep line: beam bearing + scan rate (extrapolated between frames while running)
 *  - blips: scan-beam detections (measured range/bearing), fading with age
 *  - primary contact marker: tracked range at the primary bearing
 *  - range-gate ring: expands at c/2 from each transmission, restarting every
 *    transmission interval — echoes arrive when it reaches a target's range
 *  - optional hollow markers: simulation ground truth
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { getSimState } from '../../features/sim/store'
import type { Snapshot } from '../../features/sim/types'

interface Props {
  snap: Snapshot
  rangeScale: number
  showTruth: boolean
}

export function PPIDisplay({ snap, rangeScale, showTruth }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const data = useRef({ snap, rangeScale, showTruth })
  useLayoutEffect(() => {
    data.current = { snap, rangeScale, showTruth }
  }, [snap, rangeScale, showTruth])
  const ringStart = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    let size = 0
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      size = rect.width
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.width * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Resizing clears the bitmap: repaint now rather than waiting for the next frame.
      paint(performance.now())
    }

    const css = getComputedStyle(document.documentElement)
    const col = (name: string) => css.getPropertyValue(name).trim()
    const primary = col('--as-primary') || '#22c3e6'
    const grid = col('--as-line-strong') || '#1f3651'
    const subtle = col('--as-fg-subtle') || '#627790'
    const warn = col('--as-chart-2') || '#e0703a'

    const draw = (now: number) => {
      // Always keep the loop alive; skip frames until the canvas has a usable size.
      raf = requestAnimationFrame(draw)
      if (size < 80) {
        resize()
        return
      }
      paint(now)
    }

    const paint = (now: number) => {
      if (size < 80) return
      try {
        render(now)
      } catch (err) {
        console.error('Sonar display frame failed', err)
      }
    }

    const render = (now: number) => {
      const { snap, rangeScale, showTruth } = data.current
      const { sonar, status, transmission, environment } = snap
      const w = size
      const cx = w / 2
      const cy = w / 2
      const R = w / 2 - 22
      const toXY = (bearing: number, range: number) => {
        const a = ((bearing - 90) * Math.PI) / 180
        const r = (Math.min(range, rangeScale) / rangeScale) * R
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
      }

      ctx.clearRect(0, 0, w, w)

      // Background disc
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
      bg.addColorStop(0, 'rgba(14, 60, 90, 0.35)')
      bg.addColorStop(1, 'rgba(6, 15, 28, 0.9)')
      ctx.fillStyle = bg
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fill()

      // Range rings + labels
      ctx.strokeStyle = grid
      ctx.lineWidth = 1
      ctx.font = '10px "JetBrains Mono", monospace'
      ctx.fillStyle = subtle
      for (let i = 1; i <= 4; i++) {
        const rr = (R * i) / 4
        ctx.beginPath()
        ctx.arc(cx, cy, rr, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillText(`${Math.round((rangeScale * i) / 4)} m`, cx + 4, cy - rr + 12)
      }
      // Bearing spokes and labels
      for (let b = 0; b < 360; b += 30) {
        const [x, y] = toXY(b, rangeScale)
        ctx.globalAlpha = b % 90 === 0 ? 0.9 : 0.45
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(x, y)
        ctx.stroke()
        const a = ((b - 90) * Math.PI) / 180
        ctx.fillText(String(b).padStart(3, '0'), cx + (R + 12) * Math.cos(a) - 10, cy + (R + 12) * Math.sin(a) + 3)
      }
      ctx.globalAlpha = 1

      // Sweep (extrapolate between frames while running)
      // Both clocks are performance.now(): the previous Date.now() comparison mixed epochs.
      const elapsed = status.state === 'running' ? Math.min(Math.max(0, (now - getSimState().lastUpdatePerf) / 1000), 1.5) : 0
      const bearing = (sonar.beam_bearing_deg + sonar.scan_rate_deg_s * elapsed) % 360
      const a = ((bearing - 90) * Math.PI) / 180
      if ('createConicGradient' in ctx) {
        const trail = ctx.createConicGradient(a - Math.PI * 0.5, cx, cy)
        trail.addColorStop(0.0, 'rgba(34,195,230,0)')
        trail.addColorStop(0.25, 'rgba(34,195,230,0.18)')
        trail.addColorStop(0.2501, 'rgba(34,195,230,0)')
        ctx.fillStyle = trail
        ctx.beginPath()
        ctx.arc(cx, cy, R, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.strokeStyle = primary
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a))
      ctx.stroke()

      // Range-gate ring: echoes now arriving come from range c·t/2
      const c = environment.sound_speed_m_s
      const intervalS = transmission.current.interval_ms / 1000 / Math.max(status.speed, 0.25)
      if (status.state === 'running' && !reduceMotion) {
        if (ringStart.current === 0) ringStart.current = now
        let t = (now - ringStart.current) / 1000
        if (t > intervalS) {
          ringStart.current = now
          t = 0
        }
        const gate = (c * t * status.speed) / 2
        if (gate < rangeScale) {
          ctx.strokeStyle = `rgba(34,195,230,${0.55 * (1 - gate / rangeScale)})`
          ctx.lineWidth = 1.25
          ctx.beginPath()
          ctx.arc(cx, cy, (gate / rangeScale) * R, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // Ground truth (hollow)
      if (showTruth) {
        ctx.strokeStyle = subtle
        ctx.lineWidth = 1
        for (const t of sonar.targets_truth) {
          if (t.range_m > rangeScale) continue
          const [x, y] = toXY(t.bearing_deg, t.range_m)
          ctx.beginPath()
          ctx.arc(x, y, 6, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // Scan detections, fading over one revolution
      // Both in simulated seconds: scan_rate_deg_s is per real second (already × speed).
      const revolution = 360 / Math.max(sonar.scan_rate_deg_s / Math.max(status.speed, 0.25), 1)
      for (const ct of sonar.contacts) {
        if (!ct.detected || ct.estimated_range_m === null || ct.estimated_range_m > rangeScale) continue
        const age = status.sim_time_s - ct.sim_time_s
        const alpha = Math.max(0.12, 1 - age / revolution)
        const [x, y] = toXY(ct.bearing_deg, ct.estimated_range_m)
        const radius = 2.5 + Math.min(Math.max(ct.snr_db, 0), 40) / 10
        ctx.fillStyle = `rgba(143,227,245,${alpha})`
        ctx.shadowColor = 'rgba(34,195,230,0.8)'
        ctx.shadowBlur = 8 * alpha
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        if (alpha > 0.3 && ct.target_id !== snap.primary.target.id) {
          ctx.fillStyle = `rgba(147,167,189,${alpha})`
          ctx.fillText(ct.target_id, x + 7, y - 6)
        }
      }

      // Primary contact (tracking beam)
      const p = snap.primary
      const lp = p.last_ping
      const pr = p.tracked_range_m ?? lp?.estimated_range_m
      if (pr !== null && pr !== undefined && pr <= rangeScale) {
        const [x, y] = toXY(p.target.bearing_deg, pr)
        const lost = !lp?.detected
        ctx.strokeStyle = lost ? warn : primary
        ctx.lineWidth = 1.5
        ctx.setLineDash(lost ? [3, 3] : [])
        ctx.beginPath()
        ctx.moveTo(x, y - 8)
        ctx.lineTo(x + 8, y)
        ctx.lineTo(x, y + 8)
        ctx.lineTo(x - 8, y)
        ctx.closePath()
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = lost ? warn : '#e2ecf6'
        ctx.font = '11px "JetBrains Mono", monospace'
        ctx.fillText(`T-01 ${Math.round(pr)} m${lost ? ' (lost)' : ''}`, x + 11, y + 4)
      }

      // Vehicle
      ctx.fillStyle = primary
      ctx.beginPath()
      ctx.moveTo(cx, cy - 7)
      ctx.lineTo(cx + 5, cy + 6)
      ctx.lineTo(cx - 5, cy + 6)
      ctx.closePath()
      ctx.fill()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="aspect-square w-full max-w-[640px]"
      role="img"
      aria-label={`Sonar scan display, range scale ${rangeScale} metres. Primary contact at ${Math.round(
        snap.primary.tracked_range_m ?? 0,
      )} metres, bearing ${Math.round(snap.primary.target.bearing_deg)} degrees.`}
    />
  )
}
