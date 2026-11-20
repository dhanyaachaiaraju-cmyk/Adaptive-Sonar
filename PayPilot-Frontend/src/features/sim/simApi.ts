import { apiRequest } from '../../lib/api'
import type {
  AdaptationConfig,
  BenchmarkResult,
  BenchmarkScenario,
  EnvironmentMode,
  HardwareStatus,
  LiveResponse,
  OperatingMode,
  ReferencePulse,
} from './types'

export const simApi = {
  live: (cursors: { history?: number; logs?: number; events?: number }, signal?: AbortSignal) => {
    const q = new URLSearchParams()
    if (cursors.history !== undefined) q.set('history_since', String(cursors.history))
    if (cursors.logs !== undefined) q.set('logs_since', String(cursors.logs))
    if (cursors.events !== undefined) q.set('events_since', String(cursors.events))
    return apiRequest<LiveResponse>(`/simulation/live?${q}`, { signal })
  },
  start: () => apiRequest('/simulation/start', { method: 'POST' }),
  pause: () => apiRequest('/simulation/pause', { method: 'POST' }),
  resume: () => apiRequest('/simulation/resume', { method: 'POST' }),
  step: (frames = 1) => apiRequest(`/simulation/step?frames=${frames}`, { method: 'POST' }),
  reset: (seed?: number) => apiRequest('/simulation/reset', { method: 'POST', body: seed === undefined ? {} : { seed } }),
  setSpeed: (speed: number) => apiRequest('/simulation/settings', { method: 'PUT', body: { speed } }),

  setEnvironmentMode: (mode: EnvironmentMode) => apiRequest('/environment/mode', { method: 'PUT', body: { mode } }),
  setManualEnvironment: (values: Partial<Record<'temperature_c' | 'depth_m' | 'pressure_dbar' | 'salinity_psu' | 'wind_speed_m_s', number>>) =>
    apiRequest('/environment/manual', { method: 'PUT', body: values }),
  setScenario: (mode: 'auto' | 'manual', range?: number) =>
    apiRequest('/environment/scenario', {
      method: 'PUT',
      body: { primary_range_mode: mode, primary_range_m: mode === 'manual' ? range : null },
    }),

  setTransmissionMode: (mode: OperatingMode) => apiRequest('/transmission/mode', { method: 'PUT', body: { mode } }),
  getAdaptationConfig: () => apiRequest<AdaptationConfig>('/adaptation/config'),
  putAdaptationConfig: (cfg: AdaptationConfig) =>
    apiRequest<AdaptationConfig>('/adaptation/config', { method: 'PUT', body: cfg }),
  resetAdaptationConfig: () => apiRequest<AdaptationConfig>('/adaptation/config/reset', { method: 'POST' }),

  hardware: () => apiRequest<HardwareStatus>('/hardware/status'),
  referencePulse: () => apiRequest<ReferencePulse>('/hardware/reference-pulse'),
  benchmark: (body: { scenario: BenchmarkScenario; seeds: number; duration_s: number; include_grid: boolean }) =>
    apiRequest<BenchmarkResult>('/analysis/benchmark', { method: 'POST', body, timeoutMs: 120_000 }),
}
