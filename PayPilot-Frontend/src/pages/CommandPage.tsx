import { ArrowRight, Play, X } from 'lucide-react'
import { navigate } from '../app/router'
import { DepthRuler, FrequencyInstrument, HealthPanel, MarginGauge, RangeInstrument, SoundSpeedInstrument } from '../components/instruments/Instruments'
import { AnimatedNumber, DataTag } from '../components/instruments/primitives'
import { SimGate } from '../components/sim/SimGate'
import { Button } from '../components/ui/Button'
import { CLASS_STYLE, RULE_BY_ID, type RuleClass } from '../features/sim/rules'
import { simApi } from '../features/sim/simApi'
import { useSim } from '../features/sim/store'
import type { Snapshot } from '../features/sim/types'
import { useSimAction } from '../features/sim/useSimAction'
import { cn } from '../lib/cn'
import { eventValue, num, pulse, simClock } from '../lib/format'
import { select, useSelection } from '../lib/ui-store'
import { OceanView } from '../three/ocean/OceanView'

export function CommandPage() {
  return (
    <div className="h-[calc(100dvh-var(--spacing-header))] min-h-[560px]">
      <SimGate>{(snap) => <Command snap={snap} />}</SimGate>
    </div>
  )
}

function Command({ snap }: { snap: Snapshot }) {
  const { run } = useSimAction()
  const targetId = useSelection((s) => s.targetId)
  const standby = snap.status.state === 'standby'

  return (
    <div className="flex h-full flex-col lg:block">
      <OceanView className="h-[62vh] min-h-[420px] lg:absolute lg:inset-0 lg:h-full">
        {standby && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <div className="pointer-events-auto max-w-md animate-rise-in rounded-panel holo-strong p-6 text-center">
              <p className="label-tech text-acoustic">System standby · simulation</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-fg">Ready to transmit</h2>
              <p className="mt-2 text-sm text-fg-muted">
                Start the simulated payload. The vehicle dives through an assumed thermocline, transmits, listens, and adapts its
                settings to the water and the target.
              </p>
              <Button variant="primary" size="lg" leftIcon={Play} className="mt-5" onClick={() => run('start', simApi.start)}>
                Start transmitting
              </Button>
            </div>
          </div>
        )}
      </OceanView>

      {/* Floating instrument layer (desktop) / stacked panels (mobile) */}
      <div className="pointer-events-none relative z-10 grid gap-3 p-3 lg:absolute lg:inset-0 lg:grid-cols-[300px_1fr_320px] lg:p-4 lg:pt-16">
        <div className="pointer-events-auto flex flex-col gap-3 lg:max-h-full lg:overflow-y-auto lg:scrollbar-thin">
          <div className="rounded-card holo p-4">
            <p className="label-tech text-acoustic/80">Adaptive Sonar · command</p>
            <h1 className="mt-1 font-display text-2xl leading-tight font-semibold tracking-tight text-fg">Underwater intelligence</h1>
            <p className="mt-1 readout text-2xs text-fg-subtle">
              T+{simClock(snap.status.sim_time_s)} · ping #{snap.status.ping_count} · seed {snap.status.seed}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <DataTag kind="simulated" />
              <span className="label-tech">no hardware connected</span>
            </div>
          </div>
          <div className="rounded-card holo p-4 brackets">
            <SoundSpeedInstrument snap={snap} compact />
          </div>
          <div className="rounded-card holo p-4">
            <DepthRuler snap={snap} height={170} />
          </div>
        </div>

        <div className="hidden lg:block" />

        <div className="pointer-events-auto flex flex-col gap-3 lg:max-h-full lg:overflow-y-auto lg:scrollbar-thin">
          {targetId ? <TargetInspector snap={snap} id={targetId} /> : null}
          <div className="rounded-card holo p-4">
            <FrequencyInstrument snap={snap} />
            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-hairline pt-3 readout text-2xs">
              <div>
                <dt className="text-fg-subtle">Pulse</dt>
                <dd className="text-fg">{pulse(snap.transmission.current.pulse_duration_ms)}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Interval</dt>
                <dd className="text-fg">{num(snap.transmission.current.interval_ms, 0)} ms</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Beam</dt>
                <dd className="text-fg">{num(snap.transmission.derived.beamwidth_deg, 1)}°</dd>
              </div>
            </dl>
          </div>
          <div className="flex items-center gap-3 rounded-card holo p-3">
            <MarginGauge snap={snap} size={132} />
            <div className="min-w-0 flex-1 text-2xs">
              <p className="label-tech">Primary contact T-01</p>
              <p className="mt-1 flex items-baseline gap-1">
                <AnimatedNumber
                  value={snap.primary.last_ping?.status === 'detected' ? snap.primary.last_ping.estimated_range_m : null}
                  digits={1}
                  className="text-xl text-fg"
                />
                <span className="readout text-fg-subtle">m</span>
              </p>
              <p className="readout text-fg-muted">bearing {num(snap.primary.target.bearing_deg, 0)}°</p>
              <p className="readout text-fg-muted">
                echo {snap.primary.last_ping?.status === 'detected' ? `${num(snap.primary.last_ping.measured_echo_time_ms, 1)} ms` : '—'}
              </p>
            </div>
          </div>
          <div className="rounded-card holo p-4">
            <RangeInstrument snap={snap} />
          </div>
        </div>
      </div>

      <div className="pointer-events-none relative z-10 grid gap-3 p-3 lg:absolute lg:inset-x-[324px] lg:bottom-12 lg:grid-cols-[1fr_360px] lg:p-0 xl:inset-x-[340px]">
        <RecentDecisions />
        <div className="pointer-events-auto rounded-card holo p-3">
          <p className="mb-2 label-tech">System health</p>
          <HealthPanel snap={snap} />
        </div>
      </div>
    </div>
  )
}

function RecentDecisions() {
  const events = useSim((s) => s.events)
  const recent = events.slice(-3).reverse()
  return (
    <div className="pointer-events-auto rounded-card holo p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="label-tech">Recent adaptive decisions</p>
        <button type="button" onClick={() => navigate('transmission')} className="inline-flex items-center gap-1 text-2xs text-intel hover:text-fg">
          Adaptive intelligence <ArrowRight className="size-3" aria-hidden />
        </button>
      </div>
      {recent.length === 0 ? (
        <p className="text-2xs text-fg-subtle">No adaptations yet. The controller changes settings only when its rules trigger.</p>
      ) : (
        <ul className="space-y-1.5">
          {recent.map((e) => {
            const cls = CLASS_STYLE[e.rule_class as RuleClass]
            return (
              <li key={e.seq}>
                <button
                  type="button"
                  onClick={() => {
                    select({ eventSeq: e.seq })
                    navigate('transmission')
                  }}
                  className="flex w-full animate-rise-in items-center gap-2 rounded-control px-1.5 py-1 text-left text-2xs hover:bg-surface-hover/60"
                >
                  <span className="readout w-6 shrink-0" style={{ color: cls?.color }}>
                    {e.rule}
                  </span>
                  <span className="w-36 shrink-0 truncate text-fg">{RULE_BY_ID[e.rule as 'R1']?.title ?? e.label}</span>
                  <span className="readout text-fg-subtle">{eventValue(e.previous, e.unit)}</span>
                  <ArrowRight className="size-3 shrink-0 text-intel" aria-hidden />
                  <span className="readout text-fg">{eventValue(e.new, e.unit)}</span>
                  <span className="ml-auto readout text-fg-subtle">T+{simClock(e.sim_time_s).slice(0, 8)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function TargetInspector({ snap, id }: { snap: Snapshot; id: string }) {
  const t = snap.sonar.targets_truth.find((x) => x.id === id)
  if (!t) return null
  const ping = t.primary ? snap.primary.last_ping : snap.sonar.contacts.find((c) => c.target_id === id) ?? null
  const status = ping?.status ?? 'not yet scanned'
  return (
    <div className="animate-rise-in rounded-card holo-strong p-4 brackets">
      <div className="flex items-start justify-between">
        <div>
          <p className="label-tech text-acoustic">Target inspection</p>
          <h3 className="font-display text-xl font-semibold text-fg">{t.id}</h3>
          <p className="text-2xs text-fg-muted">
            {t.label} · {t.kind}
          </p>
        </div>
        <button type="button" onClick={() => select({ targetId: null })} className="rounded p-1 text-fg-subtle hover:text-fg" aria-label="Close inspection">
          <X className="size-4" />
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 readout text-2xs">
        <dt className="text-fg-subtle">Range (truth)</dt>
        <dd className="text-right text-fg">{num(t.range_m, 1)} m</dd>
        <dt className="text-fg-subtle">Bearing</dt>
        <dd className="text-right text-fg">{num(t.bearing_deg, 1)}°</dd>
        <dt className="text-fg-subtle">Range rate</dt>
        <dd className="text-right text-fg">{num(t.radial_speed_m_s, 2)} m/s</dd>
        <dt className="text-fg-subtle">Target strength</dt>
        <dd className="text-right text-fg">{num(t.target_strength_db, 0)} dB</dd>
        <dt className="text-fg-subtle">Detection</dt>
        <dd className={cn('text-right', status === 'detected' ? 'text-acoustic' : 'text-warning')}>{status.replace(/_/g, ' ')}</dd>
        {ping && (
          <>
            <dt className="text-fg-subtle">E/N0</dt>
            <dd className="text-right text-fg">{num(ping.snr_db, 1)} dB</dd>
            <dt className="text-fg-subtle">Measured range</dt>
            <dd className="text-right text-fg">{ping.status === 'detected' ? `${num(ping.estimated_range_m, 1)} m` : '—'}</dd>
            <dt className="text-fg-subtle">Two-way time</dt>
            <dd className="text-right text-fg">{num(ping.true_echo_time_ms, 1)} ms</dd>
          </>
        )}
      </dl>
      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-3xs text-fg-subtle">
        <DataTag kind="simulated" /> {t.primary ? 'Pinged every transmission by the tracking beam.' : 'Interrogated when the scanning beam passes over it.'} Target strength is assumed.
      </p>
    </div>
  )
}
