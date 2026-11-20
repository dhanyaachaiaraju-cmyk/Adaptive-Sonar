/** Types mirroring the backend snapshot (app/sonar/engine.py::snapshot). */

export type SimState = 'standby' | 'running' | 'paused'
export type OperatingMode = 'adaptive' | 'fixed'
export type EnvironmentMode = 'auto' | 'manual'
export type Waveform = 'CW' | 'LFM'
export type HealthLevel = 'nominal' | 'caution' | 'warning'
/** `ambiguous`: echo detected but it arrived after the next transmission, so its range is wrong. */
export type PingStatus = 'detected' | 'ambiguous' | 'below_threshold' | 'blind_zone'

export interface SimStatus {
  state: SimState
  frame: number
  sim_time_s: number
  seed: number
  speed: number
  frame_seconds: number
  operating_mode: OperatingMode
  environment_mode: EnvironmentMode
  telemetry_source: string
  ping_count: number
  health: { level: HealthLevel; reasons: string[] }
  data_provenance: 'simulated'
}

export interface EnvValues {
  temperature_c: number
  depth_m: number
  pressure_dbar: number
  salinity_psu: number
  latitude_deg: number
  wind_speed_m_s: number
  ph: number
}

export interface EnvironmentView {
  mode: EnvironmentMode
  truth: EnvValues
  measured: { temperature_c: number; depth_m: number; pressure_dbar: number; salinity_psu: number; source: string }
  sound_speed_m_s: number
  sound_speed_measured_m_s: number
  sound_speed_model: string
  pressure_model: string
  validity_warnings: string[]
  dive_phase: { label: string; target_depth_m: number } | null
  thermocline_depth_m: number
}

export interface TxSettings {
  frequency_khz: number
  pulse_duration_ms: number
  waveform: Waveform
  bandwidth_khz: number
  interval_ms: number
  sound_speed_ref_m_s: number
}

export interface FrequencyCandidate {
  frequency_khz: number
  predicted_snr_at_cap_db: number
  pulse_needed_ms: number
  feasible: boolean
  di_db: number
  absorption_db_km: number
  two_way_absorption_db: number
  two_way_spreading_db: number
  noise_db: number
}

export interface Decision {
  range_of_interest_m: number
  window_m: number
  required_interval_ms: number
  measured_snr_db: number | null
  calibration_offset_db: number | null
  calibrated: boolean
  predicted_margin_db: number | null
  pulse_cap_ms: number
  pulse_cap_reason: string
  best_frequency_khz: number
  best_effort: boolean
  candidates: FrequencyCandidate[]
  searching: boolean
  consecutive_misses: number
}

export interface TransmissionView {
  operating_mode: OperatingMode
  current: TxSettings
  previous: TxSettings | null
  derived: {
    range_resolution_m: number
    max_unambiguous_range_m: number
    blind_range_m: number
    duty_cycle: number
    ping_rate_hz: number
    source_level_db: number
    pulse_energy_db: number
    directivity_index_db: number
    beamwidth_deg: number
  }
  adaptation: {
    enabled: boolean
    status: 'stable' | 'adapting' | 'searching' | 'disabled'
    last_change_ping: number | null
    decision: Decision
  }
}

export interface PingResult {
  system: string
  target_id: string
  ping_time_s: number
  bearing_deg: number
  true_range_m: number
  true_echo_time_ms: number
  detected: boolean
  measured_echo_time_ms: number | null
  estimated_range_m: number | null
  range_error_m: number | null
  snr_db: number
  received_level_db: number
  transmission_loss_db: number
  noise_level_db: number
  directivity_index_db: number
  absorption_db_km: number
  signal_excess_db: number
  apparent_range_m: number | null
  status: PingStatus
}

export interface TargetTruth {
  id: string
  label: string
  kind: string
  range_m: number
  bearing_deg: number
  target_strength_db: number
  radial_speed_m_s: number
  primary: boolean
}

export interface Contact extends PingResult {
  label: string
  sim_time_s: number
}

export interface PerfStats {
  pings: number
  window_s: number
  detection_rate: number | null
  detection_ci95: [number, number] | null
  ambiguous_rate: number | null
  mean_abs_range_error_m: number | null
  mean_snr_db: number | null
  ping_rate_hz: number | null
  mean_energy_db: number | null
  mean_resolution_m: number | null
}

export interface ComparisonSystem {
  id: string
  label: string
  description: string
  kind: 'adaptive' | 'fixed'
  settings: TxSettings
  last_ping: PingResult | null
  stats: PerfStats
  recent_pings: RecentPing[]
}

export interface RecentPing {
  t: number
  status: PingStatus
  interval_ms: number
  pulse_ms: number
  true_echo_time_ms: number
  measured_echo_time_ms: number | null
  snr_db: number
}

export interface ReferencePulse {
  settings: TxSettings
  sample_rate_hz: number
  bits: number
  total_samples: number
  decimation: number
  codes: number[]
  samples_per_cycle: number | null
  note: string
  data_provenance: 'calculated'
}

export interface SonarView {
  beam_bearing_deg: number
  scan_rate_deg_s: number
  beamwidth_deg: number
  transducer: {
    source_level_db: number
    aperture_m: number
    detection_threshold_db: number
    band_min_khz: number
    band_max_khz: number
    fluctuation_db: number
    fluctuation_corr_s: number
    directivity_index_db: number
  }
  contacts: Contact[]
  targets_truth: TargetTruth[]
  ascan: { max_range_m: number; bin_m: number; blind_range_m: number; values: number[] } | null
  waveform: {
    samples: number[]
    window_ms: number
    lead_ms: number
    carrier_cycles: number
    display_time_compression: number
    time_compressed: boolean
    start_khz: number
    end_khz: number
  }
}

export interface Snapshot {
  status: SimStatus
  environment: EnvironmentView
  transmission: TransmissionView
  primary: {
    target: TargetTruth
    range_mode: 'auto' | 'manual'
    manual_range_m: number | null
    tracked_range_m: number | null
    last_ping: PingResult | null
  }
  baseline: { settings: TxSettings; label: string; last_ping: PingResult | null; description: string }
  comparison: { window_s: number; note: string; systems: ComparisonSystem[] }
  performance: { window_s: number; adaptive: PerfStats; baseline: PerfStats }
  sonar: SonarView
  cursors: { history: number; logs: number; events: number }
}

export interface HistorySample {
  seq: number
  frame: number
  t: number
  temperature_c: number
  depth_m: number
  pressure_dbar: number
  salinity_psu: number
  sound_speed_m_s: number
  sound_speed_est_m_s: number
  frequency_khz: number
  pulse_duration_ms: number
  interval_ms: number
  waveform: Waveform
  ping_count: number
  echo_time_ms: number | null
  true_echo_time_ms: number | null
  range_true_m: number
  range_est_m: number | null
  snr_db: number | null
  detected: boolean
  baseline_snr_db: number | null
  baseline_detected: boolean
  baseline_range_est_m: number | null
  adaptations: number
}

export type LogCategory = 'simulation' | 'environment' | 'adaptation' | 'transmission' | 'status' | 'hardware'
export type LogLevel = 'info' | 'warning' | 'error'

export interface LogEntry {
  seq: number
  wall_time: string
  sim_time_s: number
  frame: number
  category: LogCategory
  level: LogLevel
  message: string
}

export interface AdaptationEvent {
  seq: number
  id: number
  ping: number
  sim_time_s: number
  wall_time: string
  rule: string
  rule_class: string
  parameter: string
  label: string
  unit: string
  previous: number | string
  new: number | string
  category: 'environment' | 'performance' | 'geometry'
  trigger: string
  reason: string
}

export interface LiveResponse extends Snapshot {
  history: HistorySample[]
  logs: LogEntry[]
  adaptation_events: AdaptationEvent[]
  reset_detected: boolean
}

export interface AdaptationConfig {
  enabled: boolean
  frequency_steps_khz: number[]
  target_margin_db: number
  high_margin_db: number
  frequency_up_hysteresis_db: number
  pulse_min_ms: number
  pulse_max_ms: number
  lfm_threshold_ms: number
  lfm_fractional_bandwidth: number
  range_window_factor: number
  min_window_m: number
  search_range_m: number
  interval_guard: number
  interval_min_ms: number
  interval_max_ms: number
  interval_change_threshold: number
  max_duty_cycle: number
  blind_fraction: number
  sound_speed_log_threshold_m_s: number
  cooldown_pings: number
  calibration_smoothing: number
  prior_target_strength_db: number
  lost_echo_pings: number
}

export interface FeasibilityCheck {
  name: string
  required: number
  available: number
  unit: string
  utilisation: number
  status: 'ok' | 'marginal' | 'exceeds'
  detail: string
}

export interface HardwareStatus {
  feasibility: {
    mcu: Record<string, string | number>
    settings: TxSettings
    checks: FeasibilityCheck[]
    overall: 'ok' | 'marginal' | 'exceeds'
    note: string
  }
  connected: boolean
  active_source: string
  configured_source: string
  serial_port: string | null
  serial_baud: number
  implemented: boolean
  note: string
  controller: string
  link: string
  subsystems: { name: string; role: string; status: string }[]
  frames: Record<string, string>
  example: string
}

export interface MeanCI {
  mean: number | null
  ci95: [number, number] | null
  n: number
}

export interface BenchmarkSystem {
  id: string
  label: string
  oracle?: boolean
  detection_rate: MeanCI
  ambiguous_rate: MeanCI
  mean_abs_range_error_m: MeanCI
  ping_rate_hz: MeanCI
  mean_energy_db: MeanCI
  mean_resolution_m: MeanCI
  pd_near: MeanCI
  pd_mid: MeanCI
  pd_far: MeanCI
}

export type BenchmarkScenario = 'range_sweep' | 'fixed_range_dive' | 'far_contact'

export interface BenchmarkResult {
  scenario: BenchmarkScenario
  scenario_description: string
  seeds: number[]
  duration_s: number
  systems: BenchmarkSystem[]
  range_bins_m: Record<string, [number, number | null]>
  method: string
  data_provenance: 'simulated'
}
