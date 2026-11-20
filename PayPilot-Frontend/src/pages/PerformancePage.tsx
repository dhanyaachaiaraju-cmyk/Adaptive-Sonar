import { Download, FlaskConical, Play, Table2 } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { BenchmarkViz } from '../components/charts/BenchmarkViz'
import { LiveScope } from '../components/charts/LiveScope'
import { DataTag, Instrument, SectionTitle } from '../components/instruments/primitives'
import { ComparisonTable } from '../components/sim/ComparisonTable'
import { SimGate } from '../components/sim/SimGate'
import { Button } from '../components/ui/Button'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { simApi } from '../features/sim/simApi'
import { useSim } from '../features/sim/store'
import type { BenchmarkResult, BenchmarkScenario, HistorySample, Snapshot } from '../features/sim/types'
import { useSimAction } from '../features/sim/useSimAction'
import { cn } from '../lib/cn'
import { num, percent, simClock } from '../lib/format'

// Session history of benchmark runs (in memory; survives page navigation, not reloads).
let runs: (BenchmarkResult & { at: string })[] = []
const subs = new Set<() => void>()
function addRun(r: BenchmarkResult) {
  runs = [{ ...r, at: new Date().toLocaleTimeString('en-GB') }, ...runs].slice(0, 8)
  subs.forEach((f) => f())
}
function useRuns() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => {
        subs.delete(f)
      }
    },
    () => runs,
  )
}

const SCENARIOS: { value: BenchmarkScenario; label: string }[] = [
  { value: 'range_sweep', label: 'Range sweep 80 → 1300 → 80 m' },
  { value: 'fixed_range_dive', label: 'Dive, contact at 450 m' },
  { value: 'far_contact', label: 'Far contact 1200 m' },
]

const COLUMNS: (keyof HistorySample)[] = [
  't', 'temperature_c', 'depth_m', 'pressure_dbar', 'salinity_psu', 'sound_speed_m_s', 'sound_speed_est_m_s', 'frequency_khz',
  'pulse_duration_ms', 'interval_ms', 'waveform', 'ping_count', 'echo_time_ms', 'range_est_m', 'range_true_m', 'snr_db', 'detected',
  'baseline_snr_db', 'baseline_detected', 'baseline_range_est_m',
]

function downloadCsv(rows: HistorySample[], seed: number) {
  const lines = ['# Adaptive Sonar — SIMULATED data (not hardware measurements)', COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => (r[c] ?? '') as string).join(','))]
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `adaptive-sonar-sim-seed${seed}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function PerformancePage() {
  return <SimGate>{(snap) => <Performance snap={snap} />}</SimGate>
}

function Performance({ snap }: { snap: Snapshot }) {
  const history = useSim((s) => s.history)
  const [table, setTable] = useState(false)
  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Performance · simulated" title="Adaptive vs fixed, measured honestly" />

      <Instrument title="Live comparison window" tag="simulated" explain={snap.comparison.note}>
        <ComparisonTable systems={snap.comparison.systems} />
        <p className="mt-2 text-2xs text-fg-subtle">
          This sliding window depends on what you changed recently, so it is illustrative only. Use the seeded benchmark below for conclusions.
        </p>
      </Instrument>

      <BenchmarkStudio />

      <section className="space-y-3">
        <SectionTitle eyebrow="Telemetry history" title="Every frame, inspectable">
          <div className="flex items-center gap-2">
            <span className="readout text-2xs text-fg-subtle">{history.length} frames buffered</span>
            <Button size="sm" variant="ghost" leftIcon={Table2} onClick={() => setTable((v) => !v)} aria-pressed={table}>
              {table ? 'Hide table' : 'Table view'}
            </Button>
            <Button size="sm" leftIcon={Download} disabled={!history.length} onClick={() => downloadCsv(history, snap.status.seed)}>
              Export CSV
            </Button>
          </div>
        </SectionTitle>
        <p className="text-2xs text-fg-subtle">Wheel to zoom · drag to pan back in time · double-click or “Go live” to follow · click a diamond to inspect that adaptation.</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <Instrument title="Target distance" tag="simulated" explain="Measured R = c·t/2 against simulated truth; amber ticks: pings without a valid echo.">
            <LiveScope series={[{ key: 'range_est_m', label: 'Measured', color: 'acoustic', area: true }, { key: 'range_true_m', label: 'Simulated truth', color: 'ref', dashed: true }]} unit="m" digits={1} missKey="detected" ariaLabel="Target distance history" />
          </Instrument>
          <Instrument title="Echo return time" tag="simulated" explain="Latest valid two-way travel time (held between pings).">
            <LiveScope series={[{ key: 'echo_time_ms', label: 'Echo time', color: 'acoustic', area: true }]} unit="ms" digits={2} missKey="detected" eventRules={['R2', 'R6']} ariaLabel="Echo time history" />
          </Instrument>
          <Instrument title="Matched-filter E/N0" tag="simulated" explain="Adaptive vs Fixed A on identical echoes; threshold 10 dB.">
            <LiveScope series={[{ key: 'snr_db', label: 'Adaptive', color: 'acoustic' }, { key: 'baseline_snr_db', label: 'Fixed A', color: 'ref', dashed: true }]} unit="dB" digits={1} thresholds={[{ value: 10, label: 'detection threshold 10 dB' }]} eventRules={['R3', 'R4']} ariaLabel="E/N0 history" />
          </Instrument>
          <Instrument title="Water temperature & depth" tag="simulated">
            <LiveScope series={[{ key: 'temperature_c', label: 'Temperature', color: 'env', area: true }]} unit="°C" digits={2} height={140} ariaLabel="Temperature history" />
            <div className="mt-3">
              <LiveScope series={[{ key: 'depth_m', label: 'Depth', color: 'acoustic' }]} unit="m" digits={1} height={140} ariaLabel="Depth history" />
            </div>
          </Instrument>
        </div>
        {table && (
          <Instrument title="Latest 50 frames" tag="simulated">
            <div className="max-h-[420px] overflow-auto scrollbar-thin">
              <table className="w-full min-w-[900px] text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-right label-tech">
                    {['Time', 'Temp °C', 'Depth m', 'c m/s', 'Freq kHz', 'Pulse ms', 'Wave', 'Echo ms', 'Meas. m', 'True m', 'E/N0', 'Fixed A'].map((h) => (
                      <th key={h} className="px-2 py-2 font-normal first:text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="readout">
                  {history
                    .slice(-50)
                    .reverse()
                    .map((h) => (
                      <tr key={h.seq} className="border-t border-hairline text-right text-fg">
                        <td className="px-2 py-1 text-left text-fg-muted">{simClock(h.t)}</td>
                        <td className="px-2 py-1">{num(h.temperature_c, 2)}</td>
                        <td className="px-2 py-1">{num(h.depth_m, 1)}</td>
                        <td className="px-2 py-1">{num(h.sound_speed_m_s, 2)}</td>
                        <td className="px-2 py-1">{h.frequency_khz}</td>
                        <td className="px-2 py-1">{num(h.pulse_duration_ms, 2)}</td>
                        <td className="px-2 py-1">{h.waveform}</td>
                        <td className="px-2 py-1">{num(h.echo_time_ms, 2)}</td>
                        <td className="px-2 py-1">{num(h.range_est_m, 1)}</td>
                        <td className="px-2 py-1 text-fg-muted">{num(h.range_true_m, 1)}</td>
                        <td className="px-2 py-1">{num(h.snr_db, 1)}</td>
                        <td className="px-2 py-1 text-fg-muted">{num(h.baseline_snr_db, 1)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Instrument>
        )}
      </section>
    </div>
  )
}

function BenchmarkStudio() {
  const { run, pending } = useSimAction()
  const history = useRuns()
  const [scenario, setScenario] = useState<BenchmarkScenario>('range_sweep')
  const [seeds, setSeeds] = useState(5)
  const [duration, setDuration] = useState(600)
  const [shown, setShown] = useState(0)
  const result = history[shown]

  const start = async () => {
    const r = await run('bench', () => simApi.benchmark({ scenario, seeds, duration_s: duration, include_grid: true }))
    if (r) {
      addRun(r)
      setShown(0)
    }
  }

  return (
    <Instrument
      title="Seeded benchmark"
      tag="simulated"
      bracket
      explain="Fresh engines (the live run is untouched), a scripted scenario, identical water, targets and echo fluctuation for every system, repeated over several seeds. Includes the best of 54 fixed settings chosen with hindsight."
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-2xs text-fg-muted">
          <span className="label-tech">Scenario</span>
          <select value={scenario} onChange={(e) => setScenario(e.target.value as BenchmarkScenario)} className="mt-1 block h-8 rounded-control border border-line-strong bg-surface-raised px-2 text-xs text-fg">
            {SCENARIOS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="label-tech">Seeds</span>
          <SegmentedControl className="mt-1" label="Seeds" value={String(seeds)} onChange={(v) => setSeeds(Number(v))} options={[{ value: '3', label: '3' }, { value: '5', label: '5' }, { value: '10', label: '10' }]} />
        </div>
        <div>
          <span className="label-tech">Simulated duration</span>
          <SegmentedControl className="mt-1" label="Duration" value={String(duration)} onChange={(v) => setDuration(Number(v))} options={[{ value: '300', label: '5 min' }, { value: '600', label: '10 min' }, { value: '1200', label: '20 min' }]} />
        </div>
        <Button variant="primary" leftIcon={Play} onClick={start} disabled={pending === 'bench'}>
          {pending === 'bench' ? 'Running…' : 'Run benchmark'}
        </Button>
      </div>

      {pending === 'bench' && <div className="mt-4 h-40 animate-pulse rounded-card border border-hairline bg-surface-sunken/60" aria-busy="true" aria-label="Running benchmark" />}

      {!result && pending !== 'bench' && (
        <p className="mt-4 flex items-start gap-2 text-xs text-fg-subtle">
          <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          Runs take a few seconds. Same scenario and seeds → identical results.
        </p>
      )}

      {result && pending !== 'bench' && (
        <div className="mt-5 space-y-4">
          {history.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="label-tech">Session runs</span>
              {history.map((r, i) => (
                <button
                  key={r.at + i}
                  type="button"
                  onClick={() => setShown(i)}
                  className={cn('rounded-full border px-2 py-0.5 readout text-3xs', i === shown ? 'border-acoustic/50 text-acoustic' : 'border-hairline text-fg-muted hover:text-fg')}
                >
                  {r.at} · {r.scenario} · {r.seeds.length} seeds
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-2 rounded-card border border-hairline bg-surface-sunken/40 p-3 text-2xs text-fg-muted sm:grid-cols-4">
            <p>
              <span className="label-tech block">Scenario</span>
              {result.scenario_description}
            </p>
            <p>
              <span className="label-tech block">Seeds</span>
              <span className="readout">
                {result.seeds.length} ({result.seeds[0]}–{result.seeds.at(-1)})
              </span>
            </p>
            <p>
              <span className="label-tech block">Duration per seed</span>
              <span className="readout">{result.duration_s} s simulated</span>
            </p>
            <p>
              <span className="label-tech block">Provenance</span>
              <DataTag kind="simulated" />
            </p>
          </div>
          <BenchmarkViz result={result} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-xs">
              <thead>
                <tr className="text-right label-tech">
                  <th className="pb-2 text-left font-normal">System</th>
                  <th className="pb-2 font-normal">P(detect) · 95 % CI</th>
                  <th className="pb-2 font-normal">Near</th>
                  <th className="pb-2 font-normal">Mid</th>
                  <th className="pb-2 font-normal">Far</th>
                  <th className="pb-2 font-normal">Ambiguous</th>
                  <th className="pb-2 font-normal">|Range err|</th>
                  <th className="pb-2 font-normal">Ping rate</th>
                  <th className="pb-2 font-normal">Energy metric</th>
                </tr>
              </thead>
              <tbody className="readout">
                {result.systems.map((s) => (
                  <tr key={s.id + (s.oracle ? 'o' : '')} className={cn('border-t border-hairline text-right', s.id === 'adaptive' && 'bg-acoustic/[0.05]')}>
                    <td className="max-w-[280px] py-1.5 pr-3 text-left font-sans text-fg-muted">{s.label}</td>
                    <td className="py-1.5 text-fg">
                      {percent(s.detection_rate.mean, 1)}
                      {s.detection_rate.ci95 && <span className="text-fg-subtle"> ({percent(s.detection_rate.ci95[0], 1)}–{percent(s.detection_rate.ci95[1], 1)})</span>}
                    </td>
                    <td className="py-1.5 text-fg-muted">{s.pd_near.mean == null ? 'n/a' : percent(s.pd_near.mean, 0)}</td>
                    <td className="py-1.5 text-fg-muted">{s.pd_mid.mean == null ? 'n/a' : percent(s.pd_mid.mean, 0)}</td>
                    <td className="py-1.5 text-fg-muted">{s.pd_far.mean == null ? 'n/a' : percent(s.pd_far.mean, 0)}</td>
                    <td className="py-1.5 text-fg-muted">{percent(s.ambiguous_rate.mean, 1)}</td>
                    <td className="py-1.5 text-fg">{s.mean_abs_range_error_m.mean == null ? '—' : `${num(s.mean_abs_range_error_m.mean, 3)} m`}</td>
                    <td className="py-1.5 text-fg-muted">{num(s.ping_rate_hz.mean, 2)} Hz</td>
                    <td className="py-1.5 text-fg-muted">{num(s.mean_energy_db.mean, 1)} dB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 text-2xs leading-relaxed text-fg-subtle md:grid-cols-2">
            <p>
              <span className="label-tech block text-fg-muted">Method</span>
              {result.method}
            </p>
            <p>
              <span className="label-tech block text-fg-muted">How to read it</span>
              Beating a fixed preset tuned for the wrong range proves little. Compare with the hindsight row, and weigh update rate, the pulse-energy metric
              (SL + 10 log τ — not electrical consumption) and resolution. The controller shares the simulator's physics, so this is optimistic for the adaptive
              system; hardware trials are needed to validate any benefit.
            </p>
          </div>
        </div>
      )}
    </Instrument>
  )
}
