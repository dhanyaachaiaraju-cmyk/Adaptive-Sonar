export function num(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** Simulated time as hh:mm:ss.s */
export function simClock(seconds: number): string {
  const s = Math.max(0, seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`
}

export function wallClock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

/** Smart precision for transmit values. */
export function pulse(ms: number): string {
  return ms < 1 ? `${num(ms * 1000, 0)} µs` : `${num(ms, 2)} ms`
}

export function percent(fraction: number | null | undefined, digits = 0): string {
  if (fraction === null || fraction === undefined) return '—'
  return `${num(fraction * 100, digits)} %`
}

export function eventValue(v: number | string, unit: string): string {
  if (typeof v === 'string') return v
  if (unit === 'ms') return pulseOrInterval(v)
  if (unit === 'm/s') return `${num(v, 2)} m/s`
  if (unit === 'kHz') return `${num(v, v % 1 ? 1 : 0)} kHz`
  return `${num(v, 2)} ${unit}`
}

function pulseOrInterval(ms: number): string {
  return ms >= 100 ? `${num(ms, 0)} ms` : pulse(ms)
}
