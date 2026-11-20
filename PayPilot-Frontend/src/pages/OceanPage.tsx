import { TriangleAlert } from 'lucide-react'
import { LiveScope } from '../components/charts/LiveScope'
import { ProfileScope } from '../components/charts/Scopes'
import { InstrumentSlider } from '../components/instruments/InstrumentSlider'
import { DepthRuler, SoundSpeedInstrument } from '../components/instruments/Instruments'
import { DataTag, Instrument, SectionTitle } from '../components/instruments/primitives'
import { SimGate } from '../components/sim/SimGate'
import { Button } from '../components/ui/Button'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { simApi } from '../features/sim/simApi'
import type { Snapshot } from '../features/sim/types'
import { useSimAction } from '../features/sim/useSimAction'
import { num } from '../lib/format'
import { OceanView } from '../three/ocean/OceanView'

const PRESETS = [
  { label: 'Warm surface layer', values: { temperature_c: 27, depth_m: 8, salinity_psu: 35.2 } },
  { label: 'Thermocline', values: { temperature_c: 14, depth_m: 110, salinity_psu: 34.6 } },
  { label: 'Cold deep water', values: { temperature_c: 4.2, depth_m: 800, salinity_psu: 34.9 } },
  { label: 'Brackish estuary', values: { temperature_c: 18, depth_m: 6, salinity_psu: 18 } },
]

type Key = 'temperature_c' | 'depth_m' | 'pressure_dbar' | 'salinity_psu' | 'wind_speed_m_s'

export function OceanPage() {
  return <SimGate>{(snap) => <Ocean snap={snap} />}</SimGate>
}

function Ocean({ snap }: { snap: Snapshot }) {
  const { run, pending } = useSimAction()
  const env = snap.environment
  const set = (key: Key) => (v: number) => run(key, () => simApi.setManualEnvironment({ [key]: v }))
  const p = snap.primary

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Digital twin · control laboratory" title="Shape the water, watch the physics respond">
        <SegmentedControl
          label="Environment mode"
          size="md"
          value={env.mode}
          onChange={(mode) => run('mode', () => simApi.setEnvironmentMode(mode))}
          options={[
            { value: 'auto', label: 'Automatic dive' },
            { value: 'manual', label: 'Manual control' },
          ]}
        />
      </SectionTitle>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-fg-muted">
            {env.mode === 'manual'
              ? 'Manual control: each value is held until you change it. Depth and pressure are two views of one quantity (Saunders 1981) — editing either updates the other.'
              : 'Automatic: the vehicle follows a seeded dive profile through an assumed thermocline. Changing any value below switches to manual control.'}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <InstrumentSlider label="Water temperature" unit="°C" min={-2} max={35} step={0.1} digits={2} value={env.truth.temperature_c} band={[2, 30]} bandLabel="Mackenzie valid 2–30 °C" defaultValue={18} pending={pending === 'temperature_c'} onCommit={set('temperature_c')} explain="Warmer water → faster sound (≈ +3 m/s per °C here) and different absorption." />
            <InstrumentSlider label="Salinity" unit="PSU" min={0} max={42} step={0.05} digits={2} value={env.truth.salinity_psu} band={[25, 40]} bandLabel="valid 25–40 PSU" defaultValue={34.5} pending={pending === 'salinity_psu'} onCommit={set('salinity_psu')} explain="≈ +1.3 m/s per PSU; also scales the absorption terms." />
            <InstrumentSlider label="Depth" unit="m" min={0} max={3000} step={1} digits={1} value={env.truth.depth_m} color="acoustic" defaultValue={20} pending={pending === 'depth_m'} onCommit={set('depth_m')} explain="Pressure term of the sound-speed equation (≈ +1.6 m/s per 100 m)." />
            <InstrumentSlider label="Pressure (gauge)" unit="dbar" min={0} max={3050} step={1} digits={1} value={env.truth.pressure_dbar} color="acoustic" pending={pending === 'pressure_dbar'} onCommit={set('pressure_dbar')} explain="Editing pressure recomputes depth with the Saunders conversion." />
            <InstrumentSlider label="Surface wind" unit="m/s" min={0} max={30} step={0.5} digits={1} value={env.truth.wind_speed_m_s} color="intel" defaultValue={6} pending={pending === 'wind_speed_m_s'} onCommit={set('wind_speed_m_s')} explain="Drives wind-generated ambient noise NL(f) in the sonar equation." />
            <div className="rounded-card border border-hairline bg-surface-sunken/40 p-4">
              <p className="label-tech">Scenario presets</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {PRESETS.map((pr) => (
                  <Button key={pr.label} size="sm" disabled={!!pending} onClick={() => run('preset', () => simApi.setManualEnvironment(pr.values))}>
                    {pr.label}
                  </Button>
                ))}
              </div>
              <p className="mt-3 text-2xs text-fg-subtle">Presets switch to manual control. The estuary preset is deliberately outside the sound-speed model's salinity range.</p>
            </div>
          </div>

          <Instrument title="Target positioning" tag="simulated" explain="Range of the primary contact. Its bearing follows the simulated drift; the current API does not expose bearing control.">
            <div className="mb-3 flex justify-end">
              <SegmentedControl
                label="Contact motion"
                value={p.range_mode}
                onChange={(mode) => run('scenario', () => simApi.setScenario(mode, Math.round(p.target.range_m)))}
                options={[
                  { value: 'auto', label: 'Automatic' },
                  { value: 'manual', label: 'Operator-set range' },
                ]}
              />
            </div>
            <InstrumentSlider
              label="Primary contact range"
              unit="m"
              min={30}
              max={1400}
              step={5}
              digits={0}
              color="ref"
              value={p.range_mode === 'manual' && p.manual_range_m ? p.manual_range_m : p.target.range_m}
              pending={pending === 'scenario'}
              onCommit={(v) => run('scenario', () => simApi.setScenario('manual', v))}
              explain={`Now ${num(p.target.range_m, 0)} m at ${num(p.target.bearing_deg, 0)}°, range rate ${p.target.radial_speed_m_s >= 0 ? '+' : ''}${num(p.target.radial_speed_m_s, 1)} m/s. Manual settings reposition the contact at up to 25 m/s (a scenario control, not a physical speed).`}
            />
          </Instrument>
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-panel border border-hairline">
            <OceanView initialView="side" className="h-[440px]" />
          </div>
          <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
            <div className="rounded-card holo p-4 brackets">
              <SoundSpeedInstrument snap={snap} />
              {env.validity_warnings.length > 0 && (
                <div role="alert" className="mt-3 rounded-control border border-warning/30 bg-warning/8 p-2.5 text-2xs text-warning">
                  <p className="flex items-center gap-1.5 font-medium">
                    <TriangleAlert className="size-3.5" aria-hidden /> Extrapolated: outside the Mackenzie validity range
                  </p>
                  <ul className="mt-1 list-disc pl-4">
                    {env.validity_warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="rounded-card holo p-4">
              <DepthRuler snap={snap} height={210} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Instrument title="Sound-speed monitor" tag="calculated" explain="Mackenzie sound speed at the vehicle and the temperature driving it. Diamonds: R1 sound-speed corrections (click to inspect).">
          <LiveScope series={[{ key: 'sound_speed_m_s', label: 'Sound speed', color: 'env', area: true }]} unit="m/s" digits={2} eventRules={['R1']} ariaLabel="Sound speed history" />
          <div className="mt-3">
            <LiveScope series={[{ key: 'temperature_c', label: 'Temperature', color: 'acoustic', area: true }]} unit="°C" digits={2} height={130} ariaLabel="Temperature history" />
          </div>
        </Instrument>
        <Instrument title="Observed sound-speed profile" tag="simulated" explain="Sound speed against depth for every frame of this run.">
          <ProfileScope />
        </Instrument>
      </div>

      <Instrument title="Sensor measurement vs simulated truth" tag="measured-sim" explain="The controller only ever sees the noisy measurement. Depth is derived from measured pressure, as on a real vehicle.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="text-left label-tech">
                <th className="pb-2 font-normal">Quantity</th>
                <th className="pb-2 text-right font-normal">Simulated truth</th>
                <th className="pb-2 text-right font-normal">Sensor reading</th>
                <th className="pb-2 text-right font-normal">Difference</th>
              </tr>
            </thead>
            <tbody className="readout">
              {(
                [
                  ['Temperature', '°C', env.truth.temperature_c, env.measured.temperature_c, 3],
                  ['Pressure', 'dbar', env.truth.pressure_dbar, env.measured.pressure_dbar, 2],
                  ['Depth (from pressure)', 'm', env.truth.depth_m, env.measured.depth_m, 2],
                  ['Salinity', 'PSU', env.truth.salinity_psu, env.measured.salinity_psu, 3],
                  ['Sound speed', 'm/s', env.sound_speed_m_s, env.sound_speed_measured_m_s, 3],
                ] as const
              ).map(([k, u, a, b, d]) => (
                <tr key={k} className="border-t border-hairline">
                  <td className="py-1.5 font-sans text-fg-muted">{k}</td>
                  <td className="py-1.5 text-right text-fg">
                    {num(a, d)} {u}
                  </td>
                  <td className="py-1.5 text-right text-acoustic">
                    {num(b, d)} {u}
                  </td>
                  <td className="py-1.5 text-right text-fg-subtle">{num(b - a, d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-fg-subtle">
          <DataTag kind="assumed" /> Sensor noise σ: 0.01 °C, 0.05 dbar, 0.01 PSU (CTD-class assumption, not a datasheet).
        </p>
      </Instrument>
    </div>
  )
}
