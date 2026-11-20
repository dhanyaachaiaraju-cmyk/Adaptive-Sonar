"""Hardware abstraction and feasibility analysis for the planned STM32F446RE payload.

Nothing here talks to hardware. It defines:

1. The interfaces the engine needs from a payload (`TransmitterPort`, `EchoReceiverPort`) in
   addition to `SensorSource` (telemetry.py). The simulation implements them today; a serial
   implementation using the frame protocol in telemetry.py can replace them later. The API and
   dashboard only see the engine's snapshot, so they do not change.
2. A feasibility check of the current transmit settings against APPROXIMATE STM32F446RE
   capabilities. The figures below are taken from ST's public product summary and must be
   verified against the datasheet (DS10693) and reference manual (RM0390) before design use.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Protocol

from app.sonar.sonar import TransmissionSettings


# ---------------------------------------------------------------------------
# Interfaces (to be implemented by a serial bridge later)
# ---------------------------------------------------------------------------
class TransmitterPort(Protocol):
    def configure(self, settings: TransmissionSettings) -> None:
        """Send TXC (frequency, pulse, waveform, interval) to the controller."""

    def acknowledged(self) -> TransmissionSettings | None:
        """Last TXS acknowledgement (what the controller actually transmits)."""


class EchoReceiverPort(Protocol):
    def latest_echo(self) -> dict | None:
        """Last ECHO frame: ping id, time of flight (us), peak level (mV)."""


class SimulatedTransmitter:
    """Accepts settings immediately (no hardware latency or quantisation)."""

    def __init__(self) -> None:
        self._last: TransmissionSettings | None = None

    def configure(self, settings: TransmissionSettings) -> None:
        self._last = settings.copy()

    def acknowledged(self) -> TransmissionSettings | None:
        return self._last


# ---------------------------------------------------------------------------
# Capability model (approximate — verify against DS10693 / RM0390)
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class McuCapabilities:
    name: str = "STM32F446RE"
    core: str = "Arm Cortex-M4F, 180 MHz"
    core_hz: float = 180e6
    sram_bytes: int = 128 * 1024
    flash_bytes: int = 512 * 1024
    adc_bits: int = 12
    adc_max_sps_single: float = 2.4e6  # one ADC; ~7.2 MS/s with three ADCs interleaved
    dac_bits: int = 12
    dac_practical_sps: float = 1.0e6  # assumed practical ceiling for DMA-driven DAC output
    uart_baud: int = 115_200  # chosen link rate, not the USART maximum

    def to_dict(self) -> dict:
        return asdict(self)


MCU = McuCapabilities()
SAMPLE_BYTES = 2
CYCLES_PER_SAMPLE_IQ = 40  # assumed cost of mixing + filtering one sample (estimate, not measured)
FRAME_BYTES_PER_PING = 80  # ECHO + TXS + ENV frames per ping, ASCII


def _check(name: str, required: float, available: float, unit: str, detail: str) -> dict:
    ratio = required / available if available else float("inf")
    status = "ok" if ratio <= 0.7 else ("marginal" if ratio <= 1.0 else "exceeds")
    return {
        "name": name,
        "required": round(required, 3),
        "available": round(available, 3),
        "unit": unit,
        "utilisation": round(ratio, 4),
        "status": status,
        "detail": detail,
    }


def feasibility(settings: TransmissionSettings, c: float, mcu: McuCapabilities = MCU) -> dict:
    f_max = settings.frequency_khz * 1000 + (settings.bandwidth_khz * 500 if settings.waveform == "LFM" else 0)
    dac_sps = 4.0 * f_max  # >= 4 samples per cycle of the highest frequency for a usable waveform
    adc_sps = 2.5 * f_max  # Nyquist plus anti-alias margin (direct RF sampling)
    listen_s = settings.interval_ms / 1000.0
    raw_bytes = adc_sps * listen_s * SAMPLE_BYTES
    eff_bw = settings.bandwidth_khz * 1000 if settings.waveform == "LFM" else 1000.0 / settings.pulse_duration_ms
    dec_sps = 4.0 * eff_bw  # complex baseband after mixing, ~4x the signal bandwidth
    dec_bytes = dec_sps * listen_s * SAMPLE_BYTES * 2  # I and Q
    cpu = adc_sps * CYCLES_PER_SAMPLE_IQ
    uart_bps = FRAME_BYTES_PER_PING * 10 * (1000.0 / settings.interval_ms)
    checks = [
        _check(
            "DAC waveform synthesis",
            dac_sps,
            mcu.dac_practical_sps,
            "S/s",
            f"4 samples per cycle at {f_max / 1000:.1f} kHz. Above the DAC ceiling, drive the transducer with "
            "timer PWM / H-bridge instead.",
        ),
        _check(
            "ADC direct sampling",
            adc_sps,
            mcu.adc_max_sps_single,
            "S/s",
            f"2.5 x {f_max / 1000:.1f} kHz highest frequency (single ADC).",
        ),
        _check(
            "Raw echo buffer in SRAM",
            raw_bytes,
            mcu.sram_bytes,
            "bytes",
            f"{listen_s * 1000:.0f} ms window at {adc_sps / 1000:.0f} kS/s, 16-bit. Exceeding SRAM means samples "
            "must be demodulated/decimated on the fly rather than stored.",
        ),
        _check(
            "Decimated I/Q buffer in SRAM",
            dec_bytes,
            mcu.sram_bytes,
            "bytes",
            f"Complex baseband at {dec_sps / 1000:.1f} kS/s (4 x {eff_bw / 1000:.2f} kHz signal bandwidth). If this "
            "exceeds SRAM, detection must also stream (keep only threshold crossings/peaks) or process the window "
            "in segments.",
        ),
        _check(
            "CPU load, real-time I/Q demodulation",
            cpu,
            mcu.core_hz,
            "cycles/s",
            f"Assumed {CYCLES_PER_SAMPLE_IQ} cycles per input sample (estimate; benchmark on target).",
        ),
        _check(
            "Serial telemetry bandwidth",
            uart_bps,
            mcu.uart_baud,
            "bit/s",
            f"~{FRAME_BYTES_PER_PING} bytes of ASCII frames per ping at {1000 / settings.interval_ms:.2f} pings/s.",
        ),
    ]
    worst = "ok"
    for ch in checks:
        if ch["status"] == "exceeds" and "Raw echo" not in ch["name"]:
            worst = "exceeds"
        elif ch["status"] == "marginal" and worst == "ok":
            worst = "marginal"
    return {
        "mcu": mcu.to_dict(),
        "settings": settings.to_dict(),
        "checks": checks,
        "overall": worst,
        "note": (
            "Order-of-magnitude feasibility only. MCU figures are approximate (verify against DS10693/RM0390); "
            "per-sample CPU cost is an estimate. Raw buffering is expected to exceed SRAM: the design assumes "
            "on-the-fly demodulation."
        ),
    }
