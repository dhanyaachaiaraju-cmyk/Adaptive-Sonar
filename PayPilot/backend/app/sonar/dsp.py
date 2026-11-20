"""Reference signal processing for the future STM32 firmware (pure Python, no hardware).

These functions describe, in executable form, what the transmitter and receiver firmware is
expected to do, so the firmware can later be validated against the same test vectors:

* `synthesize_dac_codes`   transmit pulse (CW or LFM, Tukey taper) quantised to N-bit DAC codes
* `quadrature_envelope`    I/Q demodulation at the carrier + moving-average low-pass -> envelope
* `estimate_time_of_flight` leading-edge threshold detection on the envelope with sub-sample
                            interpolation, after a blanking interval

They are deliberately simple (O(N) per sample, integer-friendly) because that is what a
Cortex-M4 can run in real time. They are not used by the live simulation, which models
detection statistically through the sonar equation.
"""

from __future__ import annotations

import math


def _taper(x: float, frac: float = 0.1) -> float:
    if x < frac:
        return 0.5 * (1 - math.cos(math.pi * x / frac))
    if x > 1 - frac:
        return 0.5 * (1 - math.cos(math.pi * (1 - x) / frac))
    return 1.0


def synthesize_pulse(
    *, frequency_hz: float, pulse_s: float, sample_rate_hz: float, waveform: str = "CW", bandwidth_hz: float = 0.0
) -> list[float]:
    """Unit-amplitude transmit pulse sampled at `sample_rate_hz`."""
    n = max(1, int(round(pulse_s * sample_rate_hz)))
    out = []
    for i in range(n):
        t = i / sample_rate_hz
        if waveform == "LFM" and bandwidth_hz > 0:
            phase = 2 * math.pi * ((frequency_hz - bandwidth_hz / 2) * t + 0.5 * (bandwidth_hz / pulse_s) * t * t)
        else:
            phase = 2 * math.pi * frequency_hz * t
        out.append(_taper(i / max(n - 1, 1)) * math.sin(phase))
    return out


def synthesize_dac_codes(samples: list[float], bits: int = 12) -> list[int]:
    """Map [-1, 1] samples to unsigned DAC codes centred at mid-scale (e.g. 0..4095 for 12 bits)."""
    full = (1 << bits) - 1
    mid = full / 2.0
    return [max(0, min(full, int(round(mid + s * mid)))) for s in samples]


def quadrature_envelope(samples: list[float], *, carrier_hz: float, sample_rate_hz: float, window: int) -> list[float]:
    """Envelope by I/Q mixing at the carrier and a boxcar low-pass of `window` samples."""
    w = max(1, window)
    i_acc = q_acc = 0.0
    i_buf = [0.0] * w
    q_buf = [0.0] * w
    env = []
    k = 2 * math.pi * carrier_hz / sample_rate_hz
    for n, x in enumerate(samples):
        i_v, q_v = x * math.cos(k * n), -x * math.sin(k * n)
        j = n % w
        i_acc += i_v - i_buf[j]
        q_acc += q_v - q_buf[j]
        i_buf[j], q_buf[j] = i_v, q_v
        env.append(2.0 * math.hypot(i_acc, q_acc) / w)
    return env


def estimate_time_of_flight(
    envelope: list[float],
    *,
    sample_rate_hz: float,
    threshold: float,
    blanking_s: float = 0.0,
    group_delay_s: float = 0.0,
) -> float | None:
    """Time (s) at which the envelope first crosses `threshold` after the blanking interval,
    linearly interpolated between samples and corrected for the filter group delay."""
    start = int(math.ceil(blanking_s * sample_rate_hz))
    for n in range(max(start, 1), len(envelope)):
        a, b = envelope[n - 1], envelope[n]
        if a < threshold <= b:
            frac = (threshold - a) / (b - a) if b != a else 0.0
            return (n - 1 + frac) / sample_rate_hz - group_delay_s
    return None
