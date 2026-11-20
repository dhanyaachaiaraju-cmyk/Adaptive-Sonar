import { useState } from 'react'
import { Oscilloscope, PingTimeline, ReceiverScope } from '../components/charts/Scopes'
import { RangeInstrument } from '../components/instruments/Instruments'
import { DataTag, Instrument, SectionTitle } from '../components/instruments/primitives'
import { SimGate } from '../components/sim/SimGate'
import { PPIDisplay } from '../components/sonar/PPIDisplay'
import { niceRange } from '../components/sonar/scale'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import type { Snapshot } from '../features/sim/types'
import { cn } from '../lib/cn'
import { num, pulse } from '../lib/format'

type Scale = 'auto' | '250' | '500' | '1000' | '1500'

export function SonarLabPage() {
  return <SimGate>{(snap) => <SonarLab snap={snap} />}</SimGate>
}

function SonarLab({ snap }: { snap: Snapshot }) {
  const [scale, setScale] = useState<Scale>('auto')
  const [truth, setTruth] = useState(false)
  const tx = snap.transmission
  const rangeScale = scale === 'auto' ? niceRange(tx.derived.max_unambiguous_range_m, snap.primary.tracked_range_m ?? snap.primary.target.range_m) : Number(scale)
  const contacts = [...snap.sonar.contacts].sort((a, b) => a.target_id.localeCompare(b.target_id))
  const c = snap.environment.sound_speed_m_s
  const tau = tx.current.pulse_duration_ms / 1000
  const bLfm = tx.current.frequency_khz * 0.3 * 1000

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Sonar lab" title="Transmit, listen, measure" />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Instrument
          title="Scanning display (plan view)"
          tag="simulated"
          bracket
          explain={`Receive beam ${num(snap.sonar.beamwidth_deg, 1)}° at ${tx.current.frequency_khz} kHz steps one beamwidth per ping (${num(snap.sonar.scan_rate_deg_s, 1)}°/s). Ring: range being received now (c·t/2).`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl label="Range scale" value={scale} onChange={setScale} options={[{ value: 'auto', label: 'Auto' }, { value: '250', label: '250' }, { value: '500', label: '500' }, { value: '1000', label: '1k' }, { value: '1500', label: '1.5k' }]} />
              <label className="flex items-center gap-1.5 text-2xs text-fg-muted">
                <input type="checkbox" checked={truth} onChange={(e) => setTruth(e.target.checked)} className="accent-[var(--as-primary)]" />
                Ground truth
              </label>
            </div>
          }
        >
          <div className="flex justify-center">
            <PPIDisplay snap={snap} rangeScale={rangeScale} showTruth={truth} />
          </div>
        </Instrument>
        <div className="space-y-5">
          <Instrument title="Range & resolution" tag="calculated" explain="Where the target sits inside the listening window, and what the pulse can resolve.">
            <RangeInstrument snap={snap} />
          </Instrument>
          <Instrument title="Scan contacts" tag="simulated">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left label-tech">
                  <th className="pb-1.5 font-normal">ID</th>
                  <th className="pb-1.5 text-right font-normal">Bearing</th>
                  <th className="pb-1.5 text-right font-normal">Range</th>
                  <th className="pb-1.5 text-right font-normal">E/N0</th>
                  <th className="pb-1.5 text-right font-normal">State</th>
                </tr>
              </thead>
              <tbody className="readout">
                {contacts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-2 font-sans text-fg-subtle">
                      No contacts yet — the beam needs to sweep past them.
                    </td>
                  </tr>
                )}
                {contacts.map((ct) => (
                  <tr key={ct.target_id} className="border-t border-hairline">
                    <td className="py-1.5 font-sans text-fg">
                      {ct.target_id} <span className="text-3xs text-fg-subtle">{ct.label}</span>
                    </td>
                    <td className="py-1.5 text-right text-fg-muted">{num(ct.bearing_deg, 0)}°</td>
                    <td className="py-1.5 text-right text-fg">{ct.status === 'detected' && ct.estimated_range_m != null ? `${num(ct.estimated_range_m, 0)} m` : '—'}</td>
                    <td className="py-1.5 text-right text-fg">{num(ct.snr_db, 1)}</td>
                    <td className={cn('py-1.5 text-right text-3xs', ct.status === 'detected' ? 'text-acoustic' : ct.status === 'ambiguous' ? 'text-intel' : 'text-warning')}>
                      {ct.status.replace(/_/g, ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Instrument>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Instrument title="Transmitted waveform" tag="calculated" explain="Oscilloscope view of the pulse for the current settings.">
          <Oscilloscope snap={snap} />
        </Instrument>
        <Instrument title="Received echo" tag="simulated" explain="What the receiver sees after the matched filter, along the tracking beam.">
          <ReceiverScope snap={snap} />
        </Instrument>
      </div>

      <Instrument title="Ping interval timeline" tag="simulated" explain="Real transmission schedules of every system on the same simulated clock: transmissions, listening windows and echo arrivals at t + 2R/c.">
        <PingTimeline snap={snap} />
      </Instrument>

      <Instrument title="CW vs LFM at the current pulse" tag="calculated" explain="The same pulse energy (same detection E/N0), different range detail. Formulas: CW c·τ/2, LFM c/2B with B = 30 % of f.">
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ['CW (gated sinusoid)', (c * tau) / 2, `bandwidth ≈ 1/τ = ${num(1 / tau / 1000, 2)} kHz`, tx.current.waveform === 'CW'],
              ['LFM chirp', c / (2 * bLfm), `sweep ${num(bLfm / 1000, 1)} kHz around ${tx.current.frequency_khz} kHz`, tx.current.waveform === 'LFM'],
            ] as const
          ).map(([name, res, note, active]) => (
            <div key={name} className={cn('rounded-card border p-4', active ? 'border-acoustic/40 bg-acoustic/[0.04]' : 'border-hairline')}>
              <p className="flex items-center justify-between">
                <span className="font-display text-sm font-semibold text-fg">{name}</span>
                {active && <span className="label-tech text-acoustic">in use</span>}
              </p>
              <p className="mt-2 readout text-2xl text-fg">
                {num(res, res < 1 ? 3 : 2)} <span className="text-xs text-fg-subtle">m resolution</span>
              </p>
              <p className="readout text-2xs text-fg-muted">{note}</p>
              <p className="readout text-2xs text-fg-muted">pulse {pulse(tx.current.pulse_duration_ms)} · energy {num(tx.derived.pulse_energy_db, 1)} dB (same for both)</p>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-2 text-2xs text-fg-subtle">
          <DataTag kind="calculated" /> R5 switches to LFM when τ ≥ 2 ms. Doppler tolerance (where CW and LFM differ) is not modelled.
        </p>
      </Instrument>
    </div>
  )
}
