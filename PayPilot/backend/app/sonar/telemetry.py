"""Telemetry sources: the seam between the simulation and future hardware.

The engine never reads "truth" directly for its decisions. It asks a
:class:`SensorSource` for an environmental *measurement* each frame. Today
that is :class:`SimulatedSensors` (truth + assumed sensor noise). Later it can
be replaced by :class:`SerialTelemetrySource`, which will read frames from an
STM32F446RE (or Arduino) over a serial link, without touching the dashboard,
the adaptation algorithm or the API.

HARDWARE INTEGRATION PLACEHOLDER
--------------------------------
Proposed ASCII line protocol (NMEA-style, XOR checksum of the characters
between '$' and '*', two hex digits), one frame per line, 115200 baud 8N1:

    $ENV,<temp_c>,<depth_m>,<pressure_dbar>,<salinity_psu>*CS
    $ECHO,<ping_id>,<time_of_flight_us>,<peak_mv>*CS
    $TXS,<ping_id>,<freq_hz>,<pulse_us>,<waveform CW|LFM>*CS   (transmitter status / ack)

and from the host to the controller:

    $TXC,<freq_hz>,<pulse_us>,<waveform>,<interval_ms>*CS       (transmit configuration)

:func:`parse_frame` and :func:`build_frame` implement this format so the
protocol can be unit-tested now. No serial library is imported and no port
is opened anywhere in this codebase yet.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Protocol

from app.sonar.acoustics import pressure_to_depth
from app.sonar.environment import EnvironmentState


@dataclass
class SensorReading:
    temperature_c: float
    depth_m: float
    pressure_dbar: float
    salinity_psu: float
    source: str

    def to_dict(self) -> dict:
        return {
            "temperature_c": round(self.temperature_c, 3),
            "depth_m": round(self.depth_m, 2),
            "pressure_dbar": round(self.pressure_dbar, 2),
            "salinity_psu": round(self.salinity_psu, 3),
            "source": self.source,
        }


class SensorSource(Protocol):
    name: str

    def read(self, truth: EnvironmentState) -> SensorReading: ...


@dataclass
class SensorAccuracy:
    """Assumed 1-sigma sensor noise (typical of a CTD-class sensor; not a datasheet)."""

    temperature_c: float = 0.01
    pressure_dbar: float = 0.05
    salinity_psu: float = 0.01


class SimulatedSensors:
    """Simulated CTD: noisy temperature, pressure and salinity. Depth is DERIVED from the
    measured pressure (Saunders 1981), as on a real vehicle, so the two always agree."""

    name = "simulation"

    def __init__(self, rng: random.Random, accuracy: SensorAccuracy | None = None):
        self.rng = rng
        self.acc = accuracy or SensorAccuracy()

    def read(self, truth: EnvironmentState) -> SensorReading:
        g = self.rng.gauss
        pressure = max(0.0, truth.pressure_dbar + g(0.0, self.acc.pressure_dbar))
        return SensorReading(
            temperature_c=truth.temperature_c + g(0.0, self.acc.temperature_c),
            depth_m=pressure_to_depth(pressure, truth.latitude_deg),
            pressure_dbar=pressure,
            salinity_psu=truth.salinity_psu + g(0.0, self.acc.salinity_psu),
            source=self.name,
        )


class HardwareNotConnectedError(RuntimeError):
    pass


class SerialTelemetrySource:
    """Placeholder for the STM32F446RE serial link. Intentionally not implemented."""

    name = "serial"

    def __init__(self, port: str | None, baud: int = 115200):
        self.port, self.baud = port, baud

    def read(self, truth: EnvironmentState) -> SensorReading:  # noqa: ARG002 - interface parity
        raise HardwareNotConnectedError(
            "Serial telemetry is not implemented yet. Run with TELEMETRY_SOURCE=simulation."
        )


# ---------------------------------------------------------------------------
# Frame protocol (pure functions; no I/O)
# ---------------------------------------------------------------------------
FRAME_FIELDS = {
    "ENV": ("temperature_c", "depth_m", "pressure_dbar", "salinity_psu"),
    "ECHO": ("ping_id", "time_of_flight_us", "peak_mv"),
    "TXS": ("ping_id", "frequency_hz", "pulse_us", "waveform"),
    "TXC": ("frequency_hz", "pulse_us", "waveform", "interval_ms"),
}


class FrameError(ValueError):
    pass


def checksum(body: str) -> str:
    value = 0
    for ch in body:
        value ^= ord(ch)
    return f"{value:02X}"


def build_frame(kind: str, *values: object) -> str:
    body = ",".join([kind, *(str(v) for v in values)])
    return f"${body}*{checksum(body)}"


def parse_frame(line: str) -> dict:
    line = line.strip()
    if not line.startswith("$") or "*" not in line:
        raise FrameError("Frame must look like $KIND,...*CS")
    body, _, cs = line[1:].rpartition("*")
    if checksum(body).upper() != cs.upper():
        raise FrameError("Checksum mismatch")
    kind, *values = body.split(",")
    fields = FRAME_FIELDS.get(kind)
    if fields is None:
        raise FrameError(f"Unknown frame type {kind!r}")
    if len(values) != len(fields):
        raise FrameError(f"{kind} expects {len(fields)} fields, got {len(values)}")
    out: dict = {"kind": kind}
    for name, raw in zip(fields, values, strict=True):
        if name == "waveform":
            out[name] = raw
        elif name == "ping_id":
            out[name] = int(raw)
        else:
            try:
                out[name] = float(raw)
            except ValueError as exc:
                raise FrameError(f"Field {name} is not numeric: {raw!r}") from exc
    return out


HARDWARE_PLAN = {
    "controller": "STM32F446RE (planned)",
    "link": "UART over USB-CDC, 115200 baud 8N1 (proposed)",
    "subsystems": [
        {
            "name": "Environmental sensors",
            "role": "Temperature, depth/pressure, conductivity → salinity",
            "status": "planned",
        },
        {"name": "Transmitter driver", "role": "Waveform synthesis (DAC/PWM) and power amplifier", "status": "planned"},
        {
            "name": "Echo receiver",
            "role": "Pre-amp, band-pass filter, envelope detection, time-of-flight capture",
            "status": "planned",
        },
        {
            "name": "Reference DSP",
            "role": "Pulse → DAC codes, I/Q envelope, threshold time-of-flight (app/sonar/dsp.py)",
            "status": "reference implementation, tested",
        },
    ],
    "frames": {
        "ENV": "$ENV,<temp_c>,<depth_m>,<pressure_dbar>,<salinity_psu>*CS",
        "ECHO": "$ECHO,<ping_id>,<time_of_flight_us>,<peak_mv>*CS",
        "TXS": "$TXS,<ping_id>,<freq_hz>,<pulse_us>,<waveform>*CS",
        "TXC": "$TXC,<freq_hz>,<pulse_us>,<waveform>,<interval_ms>*CS",
    },
    "example": build_frame("ENV", "14.82", "102.5", "103.4", "34.71"),
}
