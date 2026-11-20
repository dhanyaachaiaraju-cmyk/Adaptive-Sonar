/**
 * Plain-language description of rules R1–R6, matching app/sonar/adaptation.py.
 * Live values (inputs, previous/new settings, reasons) always come from the backend.
 */
import type { NodeId } from '../../three/neural/NeuralWorld'

export type RuleClass = 'physics' | 'constraint' | 'heuristic' | 'physics + heuristic'

export interface RuleInfo {
  id: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6'
  title: string
  plain: string
  cls: RuleClass
  changes: string
  trigger: string
  inputs: string[]
  expectation: string
  limitations: string[]
  node: NodeId
}

export const RULES: RuleInfo[] = [
  {
    id: 'R1',
    title: 'Sound-speed correction',
    plain: 'Converts every echo time into a distance using the sound speed of the water the vehicle is in right now.',
    cls: 'physics',
    changes: 'Sound speed used for range conversion',
    trigger: 'Applied on every ping; an event is logged when the estimate drifts more than the logging threshold (default 1 m/s).',
    inputs: ['Measured temperature', 'Measured salinity', 'Depth (from measured pressure)', 'Mackenzie (1981) equation'],
    expectation: 'Range estimates stay unbiased as the water changes (a 1500 m/s assumption can bias ranges by 1–3 %).',
    limitations: ['Uses the sound speed at the vehicle depth for the whole path (no refraction or layering along the ray).', 'Sensor noise propagates into the estimate.'],
    node: 'soundspeed',
  },
  {
    id: 'R2',
    title: 'Listening window & interval',
    plain: 'Waits long enough between pings for the echo from the range of interest to come back.',
    cls: 'constraint',
    changes: 'Transmission interval',
    trigger: 'Required interval changes by more than 8 %, or immediately if echoes would arrive after the next transmission.',
    inputs: ['Tracked target range', 'Sound speed (R1)', 'Window factor 1.6×, guard 1.1×'],
    expectation: 'Echoes return inside their own listening window (no range ambiguity) while pinging as fast as geometry allows.',
    limitations: ['Window and guard factors are hand-chosen.', 'Longer windows lower the update rate.'],
    node: 'interval',
  },
  {
    id: 'R3',
    title: 'Frequency selection',
    plain: 'Predicts, for every candidate frequency, whether the echo will be strong enough — then prefers the highest one that is.',
    cls: 'heuristic',
    changes: 'Transmission frequency',
    trigger: 'The current frequency cannot meet the target margin within the pulse cap, or a higher one can with 2 dB spare (after a 3-ping cooldown).',
    inputs: ['Absorption α(f, T, S, D)', 'Ambient noise NL(f)', 'Directivity DI(f) of a 15 cm aperture', 'Range of interest', 'Calibration offset learnt from echoes'],
    expectation: 'Highest frequency (narrowest beam, finest detail) that still reaches the target detection margin.',
    limitations: ['Prediction uses the same physics as the simulator, so it is more accurate here than at sea.', '"Prefer highest feasible frequency" is a policy choice, not an optimum.'],
    node: 'frequency',
  },
  {
    id: 'R4',
    title: 'Pulse-duration selection',
    plain: 'Makes the pulse just long enough to reach the target margin — longer pulses carry more energy (10·log τ).',
    cls: 'physics + heuristic',
    changes: 'Pulse duration',
    trigger: 'Predicted margin falls below 6 dB − 0.5 or rises above 14 dB, or the pulse exceeds its cap.',
    inputs: ['Predicted E/N0 at the chosen frequency', 'Blind-zone cap (≤ 50 % of range)', 'Duty-cycle cap (≤ 5 % of interval)', 'Configured min/max'],
    expectation: 'Target margin met with the least pulse energy and the smallest blind zone.',
    limitations: ['Target and upper margins are hand-chosen.', 'Energy figure is the acoustic SL + 10 log τ metric, not electrical consumption.'],
    node: 'pulse',
  },
  {
    id: 'R5',
    title: 'Waveform (CW / LFM)',
    plain: 'Long pulses switch to a frequency sweep (chirp) so range detail is set by bandwidth instead of pulse length.',
    cls: 'heuristic',
    changes: 'Waveform type and bandwidth',
    trigger: 'Pulse duration crosses the LFM threshold (default 2 ms).',
    inputs: ['Pulse duration (R4)', 'Frequency (R3) → LFM bandwidth 30 % of f'],
    expectation: 'Resolution c/2B instead of c·τ/2 at the same detection energy.',
    limitations: ['Doppler tolerance of CW vs LFM is not modelled.', 'Threshold is hand-chosen.'],
    node: 'waveform',
  },
  {
    id: 'R6',
    title: 'Search-plan adjustment',
    plain: 'If the target goes quiet for several pings, plan for the maximum search range instead of the last known range.',
    cls: 'heuristic',
    changes: 'Range of interest → interval, frequency and pulse planning',
    trigger: '4 consecutive pings without a valid (unambiguous) echo.',
    inputs: ['Consecutive missed echoes', 'Configured search range (1500 m)'],
    expectation: 'Reacquire a contact that moved out of the planned window.',
    limitations: ['Fixed search range; no bearing search pattern.', 'Lowers the update rate while searching.'],
    node: 'search',
  },
]

export const RULE_BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r])) as Record<RuleInfo['id'], RuleInfo>

export const CLASS_STYLE: Record<RuleClass, { color: string; label: string; text: string }> = {
  physics: { color: '#3fe0b5', label: 'Physics', text: 'text-env' },
  constraint: { color: '#66aaff', label: 'Constraint', text: 'text-info' },
  heuristic: { color: '#f2b54d', label: 'Heuristic', text: 'text-warning' },
  'physics + heuristic': { color: '#a493ff', label: 'Physics + heuristic', text: 'text-intel' },
}
