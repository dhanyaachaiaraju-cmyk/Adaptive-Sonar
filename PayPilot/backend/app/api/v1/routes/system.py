"""System status, sonar telemetry and the hardware-integration placeholder."""

from fastapi import APIRouter

from app import __version__
from app.api.deps import RunnerDep, SettingsDep
from app.sonar.dsp import synthesize_dac_codes, synthesize_pulse
from app.sonar.hardware import MCU, feasibility
from app.sonar.telemetry import HARDWARE_PLAN

router = APIRouter(tags=["system"])


@router.get("/system/status")
async def system_status(runner: RunnerDep, settings: SettingsDep) -> dict:
    async with runner.lock:
        status = runner.engine.snapshot()["status"]
    return {
        **status,
        "version": __version__,
        "environment": settings.app_env,
        "tick_seconds": runner.tick_seconds,
        "hardware_connected": False,
    }


@router.get("/telemetry/sonar", summary="Latest ping, A-scan, waveform, contacts and scan beam")
async def sonar_telemetry(runner: RunnerDep) -> dict:
    async with runner.lock:
        snap = runner.engine.snapshot()
        return {**snap["sonar"], "primary": snap["primary"], "data_provenance": "simulated"}


@router.get("/hardware/status", summary="Hardware integration placeholder (no hardware is accessed)")
async def hardware_status(settings: SettingsDep, runner: RunnerDep) -> dict:
    async with runner.lock:
        e = runner.engine
        check = feasibility(e.controller.settings.copy(), e.c_est)
    return {
        "feasibility": check,
        "connected": False,
        "active_source": "simulation",
        "configured_source": settings.telemetry_source,
        "serial_port": settings.serial_port,
        "serial_baud": settings.serial_baud,
        "implemented": False,
        "note": "All readings are produced by the simulation engine. Serial telemetry is a documented placeholder.",
        **HARDWARE_PLAN,
    }


@router.get(
    "/hardware/reference-pulse", summary="Current transmit pulse rendered by the reference DSP (12-bit DAC codes)"
)
async def reference_pulse(runner: RunnerDep, max_points: int = 1200) -> dict:
    async with runner.lock:
        st = runner.engine.controller.settings.copy()
    f0 = st.frequency_khz * 1000.0
    bw = st.bandwidth_khz * 1000.0 if st.waveform == "LFM" else 0.0
    # The rate a DAC-driven transmitter would need (>= 4 samples per cycle), limited to the assumed ceiling.
    fs = min(4.0 * (f0 + bw / 2), MCU.dac_practical_sps)
    pulse_s = st.pulse_duration_ms / 1000.0
    samples = synthesize_pulse(
        frequency_hz=f0, pulse_s=pulse_s, sample_rate_hz=fs, waveform=st.waveform, bandwidth_hz=bw
    )
    codes = synthesize_dac_codes(samples, bits=MCU.dac_bits)
    n = len(codes)
    step = max(1, n // max(64, min(max_points, 4000)))
    return {
        "settings": st.to_dict(),
        "sample_rate_hz": fs,
        "bits": MCU.dac_bits,
        "total_samples": n,
        "decimation": step,
        "codes": codes[::step],
        "samples_per_cycle": round(fs / (f0 + bw / 2), 2) if f0 else None,
        "note": "Output of app/sonar/dsp.py (reference implementation). Not captured from hardware.",
        "data_provenance": "calculated",
    }
