import { Crosshair, Eye, Layers3, Move3d, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PPIDisplay } from '../../components/sonar/PPIDisplay'
import { niceRange } from '../../components/sonar/scale'
import { simNow } from '../../features/sim/clock'
import { getSimState, subscribeSim, useSim } from '../../features/sim/store'
import type { RecentPing } from '../../features/sim/types'
import { cn } from '../../lib/cn'
import { num } from '../../lib/format'
import { getQuality, hasWebGL, prefersReducedMotion, setQuality, subscribeQuality, useQuality, type Quality } from '../../lib/quality'
import { getSelection, select, subscribeSelection, useSelection } from '../../lib/ui-store'
import { OceanWorld, type TargetHover, type ViewPreset } from './OceanWorld'

const VIEWS: { id: ViewPreset; label: string; icon: typeof Eye }[] = [
  { id: 'orbit', label: 'Perspective', icon: Move3d },
  { id: 'top', label: 'Plan (PPI)', icon: Crosshair },
  { id: 'side', label: 'Water column', icon: Layers3 },
  { id: 'follow', label: 'Vehicle', icon: Eye },
]

const STATUS_TEXT: Record<string, string> = {
  detected: 'Echo detected',
  ambiguous: 'Echo range-ambiguous',
  below_threshold: 'Echo below threshold (missed)',
  blind_zone: 'Inside blind zone (missed)',
}

export function OceanView({
  initialView = 'orbit',
  className,
  children,
  showToolbar = true,
}: {
  initialView?: ViewPreset
  className?: string
  children?: ReactNode
  showToolbar?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<OceanWorld | null>(null)
  const echoRef = useRef<HTMLDivElement>(null)
  const perfRef = useRef<HTMLSpanElement>(null)
  const quality = useQuality()
  const [view, setView] = useState<ViewPreset>(initialView)
  const [hover, setHover] = useState<TargetHover | null>(null)
  const [webgl] = useState(hasWebGL)
  const [failed, setFailed] = useState<string | null>(null)
  const selectedTarget = useSelection((s) => s.targetId)

  useEffect(() => {
    if (!webgl || !hostRef.current) return
    let world: OceanWorld
    try {
      world = new OceanWorld(hostRef.current, {
        quality: getQualitySafe(),
        reducedMotion: prefersReducedMotion(),
        simNow,
        view: initialView,
      })
    } catch (e) {
      queueMicrotask(() => setFailed(e instanceof Error ? e.message : 'WebGL initialisation failed'))
      return
    }
    worldRef.current = world
    let lastHoverId: string | null = null
    world.onHover = (h) => {
      if (h?.id !== lastHoverId || h) {
        lastHoverId = h?.id ?? null
        setHover(h)
      }
    }
    world.onSelect = (id) => select({ targetId: id })
    world.onEcho = (p: RecentPing) => {
      const el = echoRef.current
      if (!el) return
      const ok = p.status === 'detected'
      el.dataset.state = p.status
      el.textContent = `${STATUS_TEXT[p.status] ?? p.status} · ${ok && p.measured_echo_time_ms != null ? `${num(p.measured_echo_time_ms, 1)} ms` : `${num(p.true_echo_time_ms, 1)} ms travel`} · E/N0 ${num(p.snr_db, 1)} dB`
      el.classList.remove('echo-flash')
      void el.offsetWidth
      el.classList.add('echo-flash')
    }
    let lastFrame = -1
    const push = () => {
      const s = getSimState()
      if (!s.snapshot) return
      if (s.snapshot.status.frame < lastFrame) world.clearPings()
      lastFrame = s.snapshot.status.frame
      world.setData(s.snapshot, s.history)
    }
    push()
    const unsubSim = subscribeSim(push)
    const perfTimer = window.setInterval(() => {
      const el = perfRef.current
      if (el) el.textContent = `${world.perf.fps} fps · ${world.perf.calls} draws · ${(world.perf.triangles / 1000).toFixed(0)}k tris`
    }, 1000)
    const unsubQ = subscribeQuality(() => world.applyQuality(getQualitySafe()))
    const unsubSel = subscribeSelection(() => world.selectTarget(getSelection().targetId))
    return () => {
      unsubSim()
      window.clearInterval(perfTimer)
      unsubQ()
      unsubSel()
      world.dispose()
      worldRef.current = null
    }
    // initialView only applies on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webgl])

  const changeView = (v: ViewPreset) => {
    setView(v)
    worldRef.current?.setView(v)
  }

  if (!webgl || failed) return <Fallback reason={failed ?? 'WebGL is not available in this browser.'} className={className} />

  return (
    <div className={cn('relative isolate overflow-hidden bg-abyss', className)}>
      <div ref={hostRef} className="ocean-host absolute inset-0" />
      {showToolbar && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-2 p-3">
          <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-control holo p-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => changeView(v.id)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-[0.4rem] px-2 text-2xs font-medium transition-colors',
                  view === v.id ? 'bg-acoustic/15 text-acoustic' : 'text-fg-muted hover:text-fg',
                )}
                aria-pressed={view === v.id}
              >
                <v.icon className="size-3.5" aria-hidden />
                {v.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                select({ targetId: null })
                changeView(view)
              }}
              className="inline-flex h-7 items-center gap-1 rounded-[0.4rem] px-2 text-2xs text-fg-muted hover:text-fg"
              title="Reset camera to the current view preset"
            >
              <RotateCcw className="size-3.5" aria-hidden /> Reset
            </button>
          </div>
          <div className="pointer-events-auto flex items-center gap-1">
            <span ref={perfRef} className="rounded-control holo px-2 py-1.5 readout text-3xs text-fg-subtle" title="Measured render rate and draw calls">
              — fps
            </span>
            <QualitySwitch quality={quality} />
          </div>
        </div>
      )}
      <div
        ref={echoRef}
        className="echo-ticker pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full holo px-3 py-1 readout text-2xs text-fg-muted"
        aria-live="off"
      >
        Waiting for the first echo…
      </div>
      {hover && !selectedTarget && <TargetPopover id={hover.id} x={hover.x} y={hover.y} />}
      {children}
    </div>
  )
}

function getQualitySafe(): Quality {
  return getQuality()
}

export function QualitySwitch({ quality }: { quality: Quality }) {
  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-control holo p-1" role="radiogroup" aria-label="Graphics quality">
      <span className="px-1.5 label-tech">Quality</span>
      {(['high', 'balanced', 'performance'] as Quality[]).map((q) => (
        <button
          key={q}
          type="button"
          role="radio"
          aria-checked={quality === q}
          onClick={() => setQuality(q)}
          className={cn(
            'h-7 rounded-[0.4rem] px-2 text-2xs font-medium capitalize transition-colors',
            quality === q ? 'bg-intel/15 text-intel' : 'text-fg-muted hover:text-fg',
          )}
        >
          {q}
        </button>
      ))}
    </div>
  )
}

function TargetPopover({ id, x, y }: { id: string; x: number; y: number }) {
  const snap = useSim((s) => s.snapshot)
  const t = snap?.sonar.targets_truth.find((v) => v.id === id)
  if (!t || !snap) return null
  const contact = snap.sonar.contacts.find((c) => c.target_id === id)
  const ping = t.primary ? snap.primary.last_ping : contact
  return (
    <div
      className="pointer-events-none absolute z-30 w-60 animate-fade-in rounded-card holo-strong p-3 text-xs"
      style={{ left: Math.min(x + 16, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 280), top: Math.max(8, y - 20) }}
    >
      <p className="flex items-center justify-between">
        <span className="font-display text-sm font-semibold text-fg">{t.id}</span>
        <span className="label-tech">{t.primary ? 'tracked' : 'scan contact'}</span>
      </p>
      <p className="text-fg-muted">{t.label} · {t.kind}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 readout text-2xs">
        <dt className="text-fg-subtle">Range (truth)</dt>
        <dd className="text-right text-fg">{num(t.range_m, 1)} m</dd>
        <dt className="text-fg-subtle">Bearing</dt>
        <dd className="text-right text-fg">{num(t.bearing_deg, 1)}°</dd>
        <dt className="text-fg-subtle">Target strength</dt>
        <dd className="text-right text-fg">{num(t.target_strength_db, 0)} dB (assumed)</dd>
        <dt className="text-fg-subtle">Last echo</dt>
        <dd className="text-right text-fg">{ping ? ping.status.replace(/_/g, ' ') : 'not yet scanned'}</dd>
        {ping && (
          <>
            <dt className="text-fg-subtle">E/N0</dt>
            <dd className="text-right text-fg">{num(ping.snr_db, 1)} dB</dd>
          </>
        )}
      </dl>
      <p className="mt-2 text-3xs text-fg-subtle">Click to focus the camera and inspect.</p>
    </div>
  )
}

function Fallback({ reason, className }: { reason: string; className?: string }) {
  const snap = useSim((s) => s.snapshot)
  return (
    <div className={cn('relative flex flex-col items-center justify-center gap-3 bg-abyss p-4', className)}>
      <p className="rounded-full holo px-3 py-1 text-2xs text-warning">3D view unavailable — {reason} Showing the 2D scan display.</p>
      {snap && (
        <div className="w-full max-w-[560px]">
          <PPIDisplay
            snap={snap}
            rangeScale={niceRange(snap.transmission.derived.max_unambiguous_range_m, snap.primary.target.range_m)}
            showTruth={false}
          />
        </div>
      )}
    </div>
  )
}
