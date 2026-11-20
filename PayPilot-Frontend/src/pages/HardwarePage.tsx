import { Cable, Cpu, PlugZap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Oscilloscope } from '../components/charts/Scopes'
import { HardwareChains } from '../components/instruments/HardwareChains'
import { DataTag, Instrument, SectionTitle } from '../components/instruments/primitives'
import { SimGate } from '../components/sim/SimGate'
import { Badge } from '../components/ui/Badge'
import { Panel } from '../components/ui/Card'
import { KV } from '../components/ui/Readout'
import { ApiError } from '../lib/api'
import { simApi } from '../features/sim/simApi'
import type { HardwareStatus } from '../features/sim/types'

function fmtQty(v: number, unit: string): string {
  const abs = Math.abs(v)
  const [d, suf] = abs >= 1e6 ? [1e6, 'M'] : abs >= 1e3 ? [1e3, 'k'] : [1, '']
  return `${(v / d).toFixed(v / d >= 100 ? 0 : 1)} ${suf}${unit}`
}

export function HardwarePage() {
  const [hw, setHw] = useState<HardwareStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    simApi
      .hardware()
      .then((h) => alive && setHw(h))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : 'Could not load hardware status.'))
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="space-y-5">
      <SectionTitle eyebrow="STM32F446RE · integration readiness" title="Hardware integration" />
      <div className="rounded-card border border-dashed border-primary/30 bg-primary/[0.03] px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <PlugZap className="size-4 text-primary" aria-hidden /> Hardware integration placeholder
        </p>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">
          No physical hardware is accessed and none is required. The backend reads environmental measurements through a{' '}
          <code className="readout text-fg">SensorSource</code> interface (<code className="readout">app/sonar/telemetry.py</code>). Today that
          is the simulator. A serial source for the STM32F446RE can replace it later without changing the dashboard, the API or the
          adaptation algorithm. The reference DSP in <code className="readout">app/sonar/dsp.py</code> (pulse → 12-bit DAC codes,
          I/Q envelope, threshold time-of-flight) defines tested behaviour that firmware can later be checked against.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-2xs text-fg-muted">
        <span className="label-tech">Status legend</span>
        <DataTag kind="implemented" /> <DataTag kind="simulated" /> <DataTag kind="approximate" /> <DataTag kind="assumed" /> <DataTag kind="not-validated" />{' '}
        <DataTag kind="requires-hardware" />
      </div>

      <Instrument title="Signal chains" tag="not-validated" explain="What exists in software today versus what needs physical hardware. No STM32 is connected.">
        <HardwareChains />
      </Instrument>

      <Instrument title="Transmit pulse as the DAC would see it" tag="calculated" explain="Switch to “Reference DSP · DAC codes” for the 12-bit code stream generated for the current settings.">
        <SimGate>{(snap) => <Oscilloscope snap={snap} height={200} />}</SimGate>
      </Instrument>

      {error && <p className="text-xs text-danger">{error}</p>}
      {!hw && !error && <p className="text-xs text-fg-subtle">Loading…</p>}

      {hw && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel
            title="Link status"
            action={
              <Badge tone="neutral" dot size="sm">
                Not connected
              </Badge>
            }
          >
            <dl>
              <KV k="Active telemetry source" v={hw.active_source} />
              <KV k="Configured source (TELEMETRY_SOURCE)" v={hw.configured_source} />
              <KV k="Planned controller" v={hw.controller} />
              <KV k="Proposed link" v={hw.link} />
              <KV k="Serial port" v={hw.serial_port ?? 'not set'} />
              <KV k="Serial driver implemented" v={hw.implemented ? 'yes' : 'no (placeholder)'} />
            </dl>
            <p className="mt-3 text-2xs text-fg-subtle">{hw.note}</p>
          </Panel>

          <Panel title="Planned subsystems">
            <ul className="space-y-3">
              {hw.subsystems.map((s) => (
                <li key={s.name} className="flex items-start gap-3 text-xs">
                  <Cpu className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-fg">{s.name}</span>
                    <span className="block text-fg-muted">{s.role}</span>
                  </span>
                  <Badge size="sm">{s.status}</Badge>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            eyebrow="Design check"
            title={`Feasibility of current settings on the ${hw.feasibility.mcu.name}`}
            description={`${hw.feasibility.settings.frequency_khz} kHz ${hw.feasibility.settings.waveform}, ${hw.feasibility.settings.pulse_duration_ms} ms pulse, ${Math.round(hw.feasibility.settings.interval_ms)} ms interval — re-evaluated each time this page loads.`}
            className="xl:col-span-2"
            bodyClassName="p-0"
            action={
              <Badge tone={hw.feasibility.overall === 'ok' ? 'success' : hw.feasibility.overall === 'marginal' ? 'warning' : 'danger'} size="sm">
                {hw.feasibility.overall === 'ok' ? 'Feasible (estimate)' : hw.feasibility.overall === 'marginal' ? 'Marginal' : 'Exceeds a limit'}
              </Badge>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs">
                <thead>
                  <tr className="text-left text-2xs text-fg-subtle uppercase">
                    <th className="px-5 py-2 font-medium">Check</th>
                    <th className="py-2 text-right font-medium">Required</th>
                    <th className="py-2 text-right font-medium">Available</th>
                    <th className="py-2 text-right font-medium">Use</th>
                    <th className="py-2 pr-5 pl-4 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {hw.feasibility.checks.map((c) => (
                    <tr key={c.name} className="border-t border-line/60 align-top">
                      <td className="px-5 py-2 text-fg">
                        {c.name}
                        <span
                          className={`ml-2 text-2xs ${c.status === 'ok' ? 'text-success' : c.status === 'marginal' ? 'text-warning' : 'text-danger'}`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="py-2 text-right readout text-fg-muted">{fmtQty(c.required, c.unit)}</td>
                      <td className="py-2 text-right readout text-fg-muted">{fmtQty(c.available, c.unit)}</td>
                      <td className="py-2 text-right readout text-fg">{(c.utilisation * 100).toFixed(c.utilisation < 0.01 ? 2 : 0)} %</td>
                      <td className="py-2 pr-5 pl-4 text-2xs text-fg-subtle">{c.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-2xs text-fg-subtle">{hw.feasibility.note}</p>
          </Panel>

          <Panel
            title="Proposed serial frame protocol"
            description="ASCII, one frame per line, NMEA-style XOR checksum. Parser and builder are unit-tested in the backend."
            className="xl:col-span-2"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs">
                <tbody className="readout">
                  {Object.entries(hw.frames).map(([k, v]) => (
                    <tr key={k} className="border-t border-line/60 first:border-0">
                      <td className="py-2 pr-4 text-primary">{k}</td>
                      <td className="py-2 text-fg">{v}</td>
                      <td className="py-2 pl-4 font-sans text-2xs text-fg-subtle">{k === 'TXC' ? 'host → controller' : 'controller → host'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex items-center gap-2 text-2xs text-fg-subtle">
              <Cable className="size-3.5" aria-hidden /> Example: <code className="readout text-fg-muted">{hw.example}</code>
            </p>
          </Panel>
        </div>
      )}
    </div>
  )
}
