/**
 * Graphics quality and capability detection, shared by every renderer.
 *
 * HIGH         full particles, light shafts, DPR up to 2
 * BALANCED     fewer particles, DPR up to 1.5 (default)
 * PERFORMANCE  minimal effects, DPR 1, rendering capped at ~30 fps
 */
import { useSyncExternalStore } from 'react'

export type Quality = 'high' | 'balanced' | 'performance'

export interface QualityProfile {
  maxDpr: number
  particles: number
  lightShafts: boolean
  fpsCap: number
  antialias: boolean
}

export const QUALITY_PROFILES: Record<Quality, QualityProfile> = {
  high: { maxDpr: 2, particles: 7000, lightShafts: true, fpsCap: 60, antialias: true },
  balanced: { maxDpr: 1.5, particles: 2600, lightShafts: true, fpsCap: 60, antialias: true },
  performance: { maxDpr: 1, particles: 600, lightShafts: false, fpsCap: 30, antialias: false },
}

const KEY = 'adaptive-sonar.quality'
const listeners = new Set<() => void>()

function read(): Quality {
  // A URL override (e.g. #/overview?quality=performance) wins, for demos on weaker machines.
  const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('quality')
  if (q === 'high' || q === 'balanced' || q === 'performance') return q
  try {
    const v = window.localStorage.getItem(KEY)
    if (v === 'high' || v === 'balanced' || v === 'performance') return v
  } catch {
    /* storage unavailable */
  }
  return 'balanced'
}

let current: Quality = typeof window === 'undefined' ? 'balanced' : read()

export function setQuality(q: Quality) {
  current = q
  try {
    window.localStorage.setItem(KEY, q)
  } catch {
    /* storage unavailable — keep in memory */
  }
  listeners.forEach((l) => l())
}

export function getQuality(): Quality {
  return current
}

export function subscribeQuality(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useQuality(): Quality {
  return useSyncExternalStore(subscribeQuality, getQuality, () => 'balanced')
}

let webgl: boolean | null = null
export function hasWebGL(): boolean {
  if (webgl !== null) return webgl
  try {
    const c = document.createElement('canvas')
    webgl = !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    webgl = false
  }
  return webgl
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
