import math
import random

import pytest

from app.sonar.dsp import estimate_time_of_flight, quadrature_envelope, synthesize_dac_codes, synthesize_pulse
from app.sonar.hardware import feasibility
from app.sonar.sonar import TransmissionSettings


def test_dac_codes_are_centred_and_bounded():
    pulse = synthesize_pulse(frequency_hz=25e3, pulse_s=1e-3, sample_rate_hz=500e3)
    codes = synthesize_dac_codes(pulse, bits=12)
    assert len(codes) == 500 and min(codes) >= 0 and max(codes) <= 4095
    assert abs(sum(codes) / len(codes) - 2047.5) < 60


def test_envelope_time_of_flight_recovers_known_delay():
    fs, f0, delay = 400e3, 50e3, 6.25e-3
    pulse = synthesize_pulse(frequency_hz=f0, pulse_s=1e-3, sample_rate_hz=fs)
    rng = random.Random(1)
    rx = [rng.gauss(0, 0.02) for _ in range(int(12e-3 * fs))]
    start = int(delay * fs)
    for i, v in enumerate(pulse):
        rx[start + i] += 0.5 * v
    env = quadrature_envelope(rx, carrier_hz=f0, sample_rate_hz=fs, window=int(fs / f0) * 4)
    tof = estimate_time_of_flight(env, sample_rate_hz=fs, threshold=0.25, blanking_s=1.5e-3)
    assert tof is not None
    # Leading-edge detection is biased late by the taper and filter rise; 0.2 ms is ~15 cm at 1500 m/s.
    assert tof == pytest.approx(delay, abs=2e-4)


def test_feasibility_flags_raw_buffering_but_not_direct_sampling():
    s = TransmissionSettings(25, 16.0, "LFM", 7.5, 3000.0, 1480.0)
    checks = {c["name"]: c for c in feasibility(s, 1480.0)["checks"]}
    assert checks["ADC direct sampling"]["status"] == "ok"
    assert checks["Raw echo buffer in SRAM"]["status"] == "exceeds"
    assert checks["Serial telemetry bandwidth"]["status"] == "ok"
    assert math.isfinite(checks["CPU load, real-time I/Q demodulation"]["utilisation"])
