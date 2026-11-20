import { Badge, type Tone } from '../components/ui/Badge'
import { Panel } from '../components/ui/Card'

type Kind = 'Published model' | 'Engineering relation' | 'Assumption' | 'Heuristic policy'
const kindTone: Record<Kind, Tone> = {
  'Published model': 'success',
  'Engineering relation': 'info',
  Assumption: 'warning',
  'Heuristic policy': 'danger',
}

const ITEMS: [string, Kind, string][] = [
  ['Sound speed', 'Published model', 'Mackenzie (1981) nine-term equation. Valid 2–30 °C, 25–40 PSU, 0–8000 m; outside this range the estimate is flagged as extrapolated.'],
  ['Depth ↔ pressure', 'Published model', 'Saunders (1981). Sensors measure pressure; depth is derived from it, as on a real vehicle.'],
  ['Absorption', 'Published model', 'Ainslie & McColm (1998) boric-acid, magnesium-sulphate and pure-water terms (pH 8).'],
  ['Ambient noise', 'Published model', 'Wind noise (Coates approximation of the Wenz curves) plus thermal noise (Mellen).'],
  ['Directivity & beamwidth', 'Engineering relation', 'Baffled circular piston, 15 cm aperture: DI ≈ 10 log10(1 + (πD/λ)²), beamwidth ≈ 58.9° λ/D. Higher frequency → narrower beam and higher DI.'],
  ['Detection', 'Engineering relation', 'Noise-limited active sonar equation in energy form: E/N0 = SL + 10 log τ − 2TL + TS − (NL − DI). Detected when E/N0 ≥ 10 dB.'],
  ['Timing & range', 'Engineering relation', 't = 2R/c; R = c·t/2. Echoes after the next transmission are range-ambiguous; echoes during the pulse are blanked. Resolution c·τ/2 (CW) or c/2B (LFM).'],
  ['Source level, aperture, threshold, band', 'Assumption', 'SL 200 dB re 1 µPa @ 1 m (flat across 10–120 kHz), D = 0.15 m, DT 10 dB. Placeholders, not hardware specifications.'],
  ['Targets', 'Assumption', 'Fixed target strengths (−18 to +2 dB); log-normal echo fluctuation, 1.5 dB σ, 2 s correlation, shared by all systems. Rayleigh fading (~5.6 dB) is not modelled.'],
  ['Water column', 'Assumption', 'Generic thermocline profile with seeded variability; horizontally uniform, so the sound speed at the vehicle depth applies to the whole path (no refraction or multipath).'],
  ['Not modelled', 'Assumption', 'Reverberation, multipath, ray bending, Doppler, false alarms, transducer frequency response, vehicle self-noise.'],
  ['Adaptation rules R3–R6', 'Heuristic policy', 'Preference for the highest feasible frequency, the target and upper margins, the 1.6× window, the LFM threshold and the echo-loss count are hand-chosen and not validated.'],
]

export function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Panel title="Adaptive Sonar" eyebrow="About">
        <p className="text-sm leading-relaxed text-fg-muted">
          A monitoring and simulation console for an adaptive, software-defined sonar transmitter payload intended for autonomous
          underwater vehicles. It explores the project's central idea: a transmitter that changes its frequency, pulse duration,
          waveform and transmission interval according to underwater conditions instead of using permanently fixed settings.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          <span className="font-medium text-warning">Every value shown is simulated.</span> Nothing in this application is a
          hardware measurement or evidence of real-world sonar performance.
        </p>
      </Panel>

      <Panel title="What is physics and what is assumption" description="Colour indicates how much each element can be trusted.">
        <dl className="space-y-3">
          {ITEMS.map(([k, kind, v]) => (
            <div key={k} className="grid gap-1 text-xs sm:grid-cols-[12rem_1fr]">
              <dt className="font-medium text-fg">
                {k}
                <span className="mt-1 block">
                  <Badge tone={kindTone[kind]} size="sm">
                    {kind}
                  </Badge>
                </span>
              </dt>
              <dd className="text-fg-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="What the simulation does and does not show">
        <ul className="list-disc space-y-2 pl-5 text-xs leading-relaxed text-fg-muted">
          <li>
            Compared with a fixed setting chosen for the wrong range (e.g. 50 kHz, 1 ms, 1 s at 1 km), the adaptive transmitter
            detects far more often. That is expected and says little on its own.
          </li>
          <li>
            Compared with an energy-matched fixed setting, or the best fixed setting found with hindsight (Analytics → benchmark),
            detection rates are statistically similar. In this model, the adaptive system's advantages are a higher ping rate
            when the contact is close, less pulse energy when the margin allows, and finer resolution. It does not need to know
            the scenario in advance.
          </li>
          <li>
            Most of the range-accuracy gain comes from using the measured sound speed (rule R1). The benchmark's
            “Fixed A + measured c” ablation isolates this.
          </li>
          <li>
            The controller predicts with the same equations the simulator uses, so its predictions are better than they would be
            at sea. Hardware trials are needed to validate any benefit.
          </li>
        </ul>
      </Panel>

      <p className="text-center text-2xs text-fg-subtle">Developed as a student engineering project · simulation build</p>
    </div>
  )
}
