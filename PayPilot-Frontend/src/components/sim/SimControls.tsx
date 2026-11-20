import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { useState } from 'react'
import { simApi } from '../../features/sim/simApi'
import { useSim } from '../../features/sim/store'
import { useSimAction } from '../../features/sim/useSimAction'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'

const SPEEDS = [0.5, 1, 2, 4]

export function SimControls({ compact }: { compact?: boolean }) {
  const snap = useSim((s) => s.snapshot)
  const connection = useSim((s) => s.connection)
  const { run, pending } = useSimAction()
  const [resetOpen, setResetOpen] = useState(false)
  const [seed, setSeed] = useState('')

  const state = snap?.status.state
  const offline = connection !== 'online' || !snap

  return (
    <div className="flex items-center gap-1.5">
      {state === 'standby' && (
        <Button variant="primary" size="sm" leftIcon={Play} disabled={offline || !!pending} onClick={() => run('start', simApi.start)}>
          Start
        </Button>
      )}
      {state === 'running' && (
        <Button size="sm" leftIcon={Pause} disabled={offline || !!pending} onClick={() => run('pause', simApi.pause)}>
          Pause
        </Button>
      )}
      {state === 'paused' && (
        <>
          <Button variant="primary" size="sm" leftIcon={Play} disabled={offline || !!pending} onClick={() => run('resume', simApi.resume)}>
            Resume
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={offline || !!pending}
            onClick={() => run('step', () => simApi.step(1))}
            aria-label="Advance one frame"
            title="Advance one frame"
          >
            <SkipForward className="size-4" aria-hidden />
          </Button>
        </>
      )}
      {!state && (
        <Button size="sm" leftIcon={Play} disabled>
          Start
        </Button>
      )}

      {!compact && (
        <label className="ml-1 hidden items-center gap-1.5 text-2xs text-fg-subtle lg:flex">
          Speed
          <select
            className="h-8 rounded-control border border-line-strong bg-surface-raised px-1.5 readout text-xs text-fg"
            value={snap?.status.speed ?? 1}
            disabled={offline}
            onChange={(e) => run('speed', () => simApi.setSpeed(Number(e.target.value)))}
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="relative">
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={offline}
          onClick={() => setResetOpen((v) => !v)}
          aria-label="Reset simulation"
          title="Reset simulation"
          aria-expanded={resetOpen}
        >
          <RotateCcw className="size-4" aria-hidden />
        </Button>
        {resetOpen && (
          <form
            className={cn(
              'glass absolute right-0 top-10 z-50 w-64 animate-pop-in rounded-card border border-line-strong p-4 shadow-elevated',
            )}
            onSubmit={async (e) => {
              e.preventDefault()
              const value = seed.trim() === '' ? undefined : Number(seed)
              if (value !== undefined && (!Number.isInteger(value) || value < 0)) return
              await run('reset', () => simApi.reset(value), 'Simulation reset')
              setResetOpen(false)
              setSeed('')
            }}
          >
            <p className="text-[0.8125rem] font-semibold text-fg">Reset simulation</p>
            <p className="mt-1 text-xs text-fg-subtle">
              Clears history and logs. A fixed seed reproduces the same run for the same operator inputs.
            </p>
            <label className="mt-3 block text-2xs font-medium text-fg-muted">
              Seed (blank keeps {snap?.status.seed})
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                className="mt-1 h-8 w-full rounded-control border border-line-strong bg-surface-sunken px-2 readout text-xs text-fg"
                placeholder={String(snap?.status.seed ?? '')}
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setResetOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="danger" type="submit" disabled={pending === 'reset'}>
                Reset
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
