import { ArrowRight } from 'lucide-react'
import { DataTag, type Provenance } from './primitives'

interface Stage {
  name: string
  detail: string
  tags: Provenance[]
}

const TX: Stage[] = [
  { name: 'Controller', detail: 'STM32F446RE · Cortex-M4F 180 MHz — runs R1–R6 or receives TXC frames', tags: ['requires-hardware'] },
  { name: 'Waveform synthesis', detail: 'Reference DSP: CW/LFM pulse → 12-bit DAC codes (app/sonar/dsp.py)', tags: ['implemented', 'not-validated'] },
  { name: 'DAC / timer PWM', detail: '12-bit DAC (≈ 1 MS/s practical ceiling, approximate) or H-bridge PWM for > 250 kHz synthesis', tags: ['approximate'] },
  { name: 'Power amplifier', detail: 'Drives the transducer; sets the real source level (200 dB here is an assumption)', tags: ['assumed', 'requires-hardware'] },
  { name: 'Transducer', detail: '15 cm piston assumed for DI(f) and beamwidth; flat 10–120 kHz response assumed', tags: ['assumed'] },
]

const RX: Stage[] = [
  { name: 'Transducer / hydrophone', detail: 'Receives the echo; blanked during transmission (blind zone c·τ/2)', tags: ['simulated'] },
  { name: 'Pre-amp + band-pass', detail: 'Gain and anti-alias filtering around the carrier', tags: ['requires-hardware'] },
  { name: 'ADC', detail: '12-bit, ≈ 2.4 MS/s single ADC (approximate) — direct sampling feasible for this band', tags: ['approximate'] },
  { name: 'I/Q demodulation + envelope', detail: 'Reference DSP: quadrature mix, boxcar low-pass, envelope (tested on synthetic echoes)', tags: ['implemented', 'not-validated'] },
  { name: 'Time-of-flight detection', detail: 'Leading-edge threshold crossing after blanking, sub-sample interpolation', tags: ['implemented', 'not-validated'] },
  { name: 'Serial telemetry', detail: '$ECHO / $ENV / $TXS frames, XOR checksum; parser unit-tested; no port opened', tags: ['implemented', 'requires-hardware'] },
]

function Chain({ title, stages, color }: { title: string; stages: Stage[]; color: string }) {
  return (
    <div>
      <p className="label-tech" style={{ color }}>
        {title}
      </p>
      <ol className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-stretch">
        {stages.map((s, i) => (
          <li key={s.name} className="flex items-center gap-2 lg:flex-1">
            <div className="h-full flex-1 rounded-card border border-hairline bg-surface-sunken/50 p-3">
              <p className="font-display text-sm font-semibold text-fg">{s.name}</p>
              <p className="mt-1 text-2xs leading-snug text-fg-muted">{s.detail}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {s.tags.map((t) => (
                  <DataTag key={t} kind={t} />
                ))}
              </div>
            </div>
            {i < stages.length - 1 && <ArrowRight className="hidden size-4 shrink-0 text-fg-subtle lg:block" aria-hidden />}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function HardwareChains() {
  return (
    <div className="space-y-5">
      <Chain title="Transmit chain" stages={TX} color="#46e0ff" />
      <Chain title="Receive chain" stages={RX} color="#3fe0b5" />
    </div>
  )
}
