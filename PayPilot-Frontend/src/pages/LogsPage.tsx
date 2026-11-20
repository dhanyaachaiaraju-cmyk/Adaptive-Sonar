import { ChevronDown, Pause, Play, Search } from 'lucide-react'
import { navigate } from '../app/router'
import { useMemo, useState } from 'react'
import { SimGate } from '../components/sim/SimGate'
import { Badge, type Tone } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Panel } from '../components/ui/Card'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { useSim } from '../features/sim/store'
import type { LogCategory, LogEntry, LogLevel } from '../features/sim/types'
import { cn } from '../lib/cn'
import { eventValue, simClock, wallClock } from '../lib/format'
import { select } from '../lib/ui-store'

type Cat = 'all' | LogCategory | 'detection'
const CATS: Cat[] = ['all', 'status', 'environment', 'adaptation', 'transmission', 'detection', 'simulation']

/** Detection events are transmission-category entries about echoes. */
const isDetection = (l: LogEntry) => l.category === 'transmission' && /echo|ambiguous|signal excess/i.test(l.message)
const levelTone: Record<LogLevel, Tone> = { info: 'info', warning: 'warning', error: 'danger' }

export function LogsPage() {
  return <SimGate>{() => <Logs />}</SimGate>
}

function Logs() {
  const logs = useSim((s) => s.logs)
  const [cat, setCat] = useState<Cat>('all')
  const [open, setOpen] = useState<number | null>(null)
  const events = useSim((s) => s.events)
  const [warnOnly, setWarnOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [frozen, setFrozen] = useState<LogEntry[] | null>(null)

  const source = frozen ?? logs
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return source
      .filter(
        (l) =>
          (cat === 'all' || (cat === 'detection' ? isDetection(l) : l.category === cat)) &&
          (!warnOnly || l.level !== 'info') &&
          (!q || l.message.toLowerCase().includes(q)),
      )
      .slice(-500)
      .reverse()
  }, [source, cat, warnOnly, query])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: logs.length }
    for (const l of logs) {
      c[l.category] = (c[l.category] ?? 0) + 1
      if (isDetection(l)) c.detection = (c.detection ?? 0) + 1
    }
    return c
  }, [logs])

  return (
    <Panel
      title="System event log"
      description="Simulation, environmental, adaptation, transmission and status events. Timestamps: mission time (T+) and wall-clock time (local)."
      bodyClassName="p-0"
      action={
        <Button size="sm" variant="ghost" leftIcon={frozen ? Play : Pause} onClick={() => setFrozen(frozen ? null : logs)}>
          {frozen ? 'Follow live' : 'Freeze'}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <SegmentedControl
          label="Category"
          value={cat}
          onChange={setCat}
          className="max-w-full overflow-x-auto"
          options={CATS.map((c) => ({ value: c, label: c === 'all' ? 'All' : c[0].toUpperCase() + c.slice(1), count: counts[c] ?? 0 }))}
        />
        <label className="flex items-center gap-1.5 text-xs text-fg-muted">
          <input type="checkbox" checked={warnOnly} onChange={(e) => setWarnOnly(e.target.checked)} className="accent-[var(--as-warning)]" />
          Warnings only
        </label>
        <label className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <span className="sr-only">Filter messages</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter messages…"
            className="h-8 w-full rounded-control border border-line-strong bg-surface-sunken pr-2 pl-8 text-xs text-fg placeholder:text-fg-subtle"
          />
        </label>
      </div>
      <div className="max-h-[calc(100dvh-16rem)] min-h-64 overflow-auto scrollbar-thin" aria-live={frozen ? 'off' : 'polite'} aria-relevant="additions">
        {shown.length === 0 ? (
          <p className="px-5 py-6 text-xs text-fg-subtle">No log entries match.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {shown.map((l) => {
              const rule = l.category === 'adaptation' ? /^\[(R\d)\]/.exec(l.message)?.[1] : undefined
              const ev = rule ? events.find((e) => e.rule === rule && Math.abs(e.sim_time_s - l.sim_time_s) < 0.6) : undefined
              const expanded = open === l.seq
              return (
                <li key={l.seq} className={cn('px-5 py-2.5 text-xs', l.level !== 'info' && 'bg-warning/[0.03]')}>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : l.seq)}
                    aria-expanded={expanded}
                    className="grid w-full gap-x-4 gap-y-1 text-left sm:grid-cols-[9.5rem_8rem_1fr_auto]"
                  >
                    <span className="readout text-fg-muted">
                      T+{simClock(l.sim_time_s)}
                      <span className="block text-2xs text-fg-subtle">{wallClock(l.wall_time)}</span>
                    </span>
                    <span className="flex flex-wrap items-start gap-1">
                      <Badge tone={levelTone[l.level]} size="sm">
                        {l.level}
                      </Badge>
                      <span className="text-2xs text-fg-subtle capitalize">{isDetection(l) ? 'detection' : l.category}</span>
                    </span>
                    <span className="text-fg">{l.message}</span>
                    <ChevronDown className={cn('size-3.5 text-fg-subtle transition-transform', expanded && 'rotate-180')} aria-hidden />
                  </button>
                  {expanded && (
                    <dl className="mt-2 grid animate-fade-in gap-x-6 gap-y-1 rounded-control border border-hairline bg-surface-sunken/50 p-3 readout text-2xs sm:grid-cols-2">
                      <dt className="text-fg-subtle">Log sequence</dt>
                      <dd className="text-fg">#{l.seq}</dd>
                      <dt className="text-fg-subtle">Simulation frame</dt>
                      <dd className="text-fg">{l.frame}</dd>
                      <dt className="text-fg-subtle">Simulated time</dt>
                      <dd className="text-fg">{l.sim_time_s.toFixed(2)} s</dd>
                      <dt className="text-fg-subtle">Wall clock (UTC)</dt>
                      <dd className="text-fg">{l.wall_time}</dd>
                      {ev && (
                        <>
                          <dt className="text-fg-subtle">Rule</dt>
                          <dd className="text-intel">
                            {ev.rule} · {ev.rule_class} · ping #{ev.ping}
                          </dd>
                          <dt className="text-fg-subtle">Previous → new</dt>
                          <dd className="text-fg">
                            {eventValue(ev.previous, ev.unit)} → {eventValue(ev.new, ev.unit)}
                          </dd>
                          <dt className="text-fg-subtle">Trigger</dt>
                          <dd className="text-fg-muted">{ev.trigger}</dd>
                          <dd className="sm:col-span-2">
                            <button
                              type="button"
                              onClick={() => {
                                select({ eventSeq: ev.seq })
                                navigate('transmission')
                              }}
                              className="text-intel hover:text-fg"
                            >
                              Show in the decision network →
                            </button>
                          </dd>
                        </>
                      )}
                    </dl>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Panel>
  )
}
