const NICE_RANGES = [100, 200, 250, 500, 750, 1000, 1500, 2000, 3000]

/** Display range: covers the primary contact with margin, preferring the listening window. */
export function niceRange(maxUnambiguous: number, primary: number): number {
  const need = Math.max(primary * 1.15, Math.min(maxUnambiguous, primary * 2.2), 100)
  return NICE_RANGES.find((r) => r >= need) ?? NICE_RANGES[NICE_RANGES.length - 1]
}
