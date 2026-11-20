import { RotateCcw } from 'lucide-react'
import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

const COLOR = { env: '#3fe0b5', acoustic: '#46e0ff', intel: '#a493ff', ref: '#ff9a5c' }

export interface InstrumentSliderProps {
  label: string
  unit: string
  min: number
  max: number
  step: number
  value: number
  digits?: number
  color?: keyof typeof COLOR
  band?: [number, number]
  bandLabel?: string
  defaultValue?: number
  disabled?: boolean
  pending?: boolean
  explain?: ReactNode
  onCommit: (v: number) => void
}

/** Precision control: tick scale, validity band, live value, typed entry, reset, apply feedback. */
export function InstrumentSlider({
  label,
  unit,
  min,
  max,
  step,
  value,
  digits = 1,
  color = 'env',
  band,
  bandLabel,
  defaultValue,
  disabled,
  pending,
  explain,
  onCommit,
}: InstrumentSliderProps) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const shown = drag ?? value
  const pct = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100
  const c = COLOR[color]
  const commitText = () => {
    if (draft === null) return
    const n = Number(draft)
    setDraft(null)
    if (Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)))
  }
  const release = () => {
    if (drag !== null) onCommit(drag)
    setDrag(null)
  }
  const ticks = Array.from({ length: 21 }, (_, i) => i)
  const outside = band && (value < band[0] || value > band[1])

  return (
    <div className={cn('rounded-card border border-hairline bg-surface-sunken/40 p-4 transition-colors', pending && 'border-acoustic/40')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={id} className="label-tech" style={{ color: c }}>
            {label}
          </label>
          <div className="mt-1 flex items-baseline gap-1.5">
            <input
              aria-label={`${label} value in ${unit}`}
              type="number"
              inputMode="decimal"
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              value={draft ?? shown.toFixed(digits)}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitText()
                if (e.key === 'Escape') setDraft(null)
              }}
              className="w-32 bg-transparent readout text-2xl text-fg outline-none [appearance:textfield] focus-visible:text-acoustic"
            />
            <span className="readout text-xs text-fg-subtle">{unit}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn('label-tech', pending ? 'text-acoustic' : outside ? 'text-warning' : 'text-fg-subtle')}>
            {pending ? 'applying…' : outside ? 'outside model range' : 'applied'}
          </span>
          {defaultValue !== undefined && (
            <button
              type="button"
              disabled={disabled || Math.abs(value - defaultValue) < step / 2}
              onClick={() => onCommit(defaultValue)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs text-fg-subtle hover:text-fg disabled:opacity-40"
              title={`Reset to ${defaultValue} ${unit}`}
            >
              <RotateCcw className="size-3" aria-hidden /> reset
            </button>
          )}
        </div>
      </div>
      <div className="relative mt-3">
        <div className="pointer-events-none absolute inset-x-0 -top-0.5 flex justify-between">
          {ticks.map((t) => (
            <span key={t} className={cn('w-px bg-line-strong', t % 5 === 0 ? 'h-2.5' : 'h-1.5')} />
          ))}
        </div>
        {band && (
          <span
            className="pointer-events-none absolute top-2.5 h-0.5 rounded-full"
            style={{ left: `${pct(band[0])}%`, width: `${pct(band[1]) - pct(band[0])}%`, background: `${c}88` }}
            title={bandLabel}
          />
        )}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={shown}
          style={{ '--fill': `${pct(shown)}%`, '--fill-color': c } as CSSProperties}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={release}
          onKeyUp={release}
          onBlur={release}
          className="range-instrument relative mt-1.5 w-full"
        />
        <div className="flex justify-between readout text-3xs text-fg-subtle">
          <span>
            {min} {unit}
          </span>
          {band && <span style={{ color: `${c}cc` }}>{bandLabel}</span>}
          <span>
            {max} {unit}
          </span>
        </div>
      </div>
      {explain && <p className="mt-2 text-2xs leading-relaxed text-fg-subtle">{explain}</p>}
    </div>
  )
}
