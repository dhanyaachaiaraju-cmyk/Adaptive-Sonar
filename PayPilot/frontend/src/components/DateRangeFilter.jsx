import { useState } from 'react'
import { PRESETS, presetRange, validateDateRange } from '../lib/dateRange'
import { Button, Input, Select } from './ui'

/**
 * Preset + custom date range control. Calls onChange({ preset, from, to }) only
 * with valid ranges; invalid custom input shows an inline error and is not applied.
 */
export default function DateRangeFilter({ value, onChange }) {
  const [draft, setDraft] = useState({ from: value.from, to: value.to })
  const [error, setError] = useState(null)
  const isCustom = value.preset === 'custom'

  function choosePreset(key) {
    setError(null)
    if (key === 'custom') {
      setDraft({ from: value.from, to: value.to })
      onChange({ ...value, preset: 'custom' })
      return
    }
    const range = presetRange(key)
    setDraft(range)
    onChange({ preset: key, ...range })
  }

  function applyCustom(e) {
    e.preventDefault()
    const message = validateDateRange(draft.from, draft.to)
    setError(message)
    if (!message) onChange({ preset: 'custom', from: draft.from, to: draft.to })
  }

  return (
    <form onSubmit={applyCustom} className="flex flex-wrap items-start gap-2" aria-label="Date range">
      <Select aria-label="Period" value={value.preset} onChange={(e) => choosePreset(e.target.value)} className="w-auto">
        {PRESETS.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
      </Select>
      {isCustom && (
        <>
          <Input
            type="date"
            aria-label="From"
            aria-invalid={Boolean(error)}
            value={draft.from ?? ''}
            max={draft.to || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            className="w-auto"
          />
          <Input
            type="date"
            aria-label="To"
            aria-invalid={Boolean(error)}
            value={draft.to ?? ''}
            min={draft.from || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            className="w-auto"
          />
          <Button type="submit" variant="secondary">Apply</Button>
        </>
      )}
      {error && <p role="alert" className="w-full text-xs text-red-600">{error}</p>}
    </form>
  )
}
