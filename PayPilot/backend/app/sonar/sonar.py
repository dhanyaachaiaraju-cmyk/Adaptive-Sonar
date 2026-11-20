"""Active-sonar ping model (physics layer).

For each ping against a target the model computes, in order:

1. True two-way travel time  t = 2R / c_true   (c_true from the TRUE water state)
2. Transmission loss         TL = 20 log10(R / 1 m) + alpha(f, T, S, D) * R / 1000   (one way, dB)
3. Ambient noise             NL(f) = spectral level, dB re 1 uPa^2/Hz (wind + thermal)
4. Receive directivity       DI(f) of a circular piston of fixed aperture (frequency dependent)
5. Matched-filter SNR        E/N0 = SL + 10 log10(tau / 1 s) - 2 TL + TS - (NL - DI) + fluctuation
   (noise-limited active sonar equation in energy form; reverberation is NOT modelled, so the
   matched-filter output depends on pulse energy, not on whether the pulse is CW or LFM)
6. Timing                    echoes arriving after the next transmission fold into the next
                             listening window (range ambiguity); echoes that arrive while the
                             transmitter is still on are blanked (blind zone)
7. Detection                 E/N0 >= detection threshold (DT). The echo-level fluctuation is a
                             time-correlated process shared by every system pinging the same
                             target, so comparisons see identical echo scenarios.
8. Measurement               t_meas = t + jitter, jitter sigma ~ resolution / sqrt(2 E/N0)
9. Range estimate            R_est = c_ref * t_meas / 2   (c_ref chosen by each system)

Transducer figures (source level, aperture, detection threshold, usable band) are ASSUMED
placeholder values, not specifications of real hardware.
"""

from __future__ import annotations

import math
import random
from dataclasses import asdict, dataclass

from app.sonar import acoustics as ac


@dataclass
class TransducerModel:
    source_level_db: float = 200.0  # on-axis SL, dB re 1 uPa @ 1 m, assumed constant across the band
    aperture_m: float = 0.15  # circular piston diameter used for DI(f) and beamwidth(f)
    detection_threshold_db: float = 10.0  # required matched-filter E/N0 (assumed)
    band_min_khz: float = 10.0
    band_max_khz: float = 120.0
    fluctuation_db: float = 1.5  # 1-sigma echo-level fluctuation (log-normal, assumed)
    fluctuation_corr_s: float = 2.0  # correlation time of that fluctuation

    def directivity_index_db(self, frequency_khz: float, c: float = 1500.0) -> float:
        return ac.piston_directivity_index_db(frequency_khz, self.aperture_m, c)

    def beamwidth_deg(self, frequency_khz: float, c: float = 1500.0) -> float:
        return ac.piston_beamwidth_deg(frequency_khz, self.aperture_m, c)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class TransmissionSettings:
    frequency_khz: float
    pulse_duration_ms: float
    waveform: str  # "CW" | "LFM"
    bandwidth_khz: float
    interval_ms: float
    sound_speed_ref_m_s: float  # speed used to convert echo time to range

    def copy(self) -> TransmissionSettings:
        return TransmissionSettings(**asdict(self))

    def to_dict(self) -> dict:
        d = asdict(self)
        for k in ("frequency_khz", "pulse_duration_ms", "bandwidth_khz", "interval_ms", "sound_speed_ref_m_s"):
            d[k] = round(d[k], 3)
        return d

    def range_resolution_m(self, c: float) -> float:
        if self.waveform == "LFM" and self.bandwidth_khz > 0:
            return c / (2.0 * self.bandwidth_khz * 1000.0)
        return c * self.pulse_duration_ms / 1000.0 / 2.0

    def max_unambiguous_range_m(self, c: float) -> float:
        return c * self.interval_ms / 1000.0 / 2.0

    def blind_range_m(self, c: float) -> float:
        """Receiver is blanked while transmitting: echoes from closer than c*tau/2 are lost."""
        return c * self.pulse_duration_ms / 1000.0 / 2.0

    def pulse_energy_db(self, source_level_db: float) -> float:
        """Transmitted energy flux density on axis, dB re 1 uPa^2 s @ 1 m."""
        return source_level_db + 10.0 * math.log10(self.pulse_duration_ms / 1000.0)


def model_snr_db(
    *,
    frequency_khz: float,
    pulse_duration_ms: float,
    range_m: float,
    target_strength_db: float,
    temperature_c: float,
    salinity_psu: float,
    depth_m: float,
    wind_speed_m_s: float,
    transducer: TransducerModel,
    c: float,
    ph: float = 8.0,
) -> dict:
    """Noise-limited active sonar equation (energy form), without fluctuation. Returns every term."""
    alpha = ac.absorption_db_per_km(frequency_khz, temperature_c, salinity_psu, depth_m, ph)
    tl = ac.one_way_transmission_loss_db(range_m, alpha)
    nl = ac.ambient_noise_spectrum_db(frequency_khz, wind_speed_m_s)
    di = transducer.directivity_index_db(frequency_khz, c)
    rl = transducer.source_level_db - 2.0 * tl + target_strength_db
    snr = rl + 10.0 * math.log10(pulse_duration_ms / 1000.0) - (nl - di)
    return {"snr": snr, "alpha": alpha, "tl": tl, "nl": nl, "di": di, "rl": rl}


@dataclass
class PingResult:
    system: str
    target_id: str
    ping_time_s: float
    bearing_deg: float
    true_range_m: float
    true_echo_time_ms: float
    detected: bool
    measured_echo_time_ms: float | None
    estimated_range_m: float | None
    range_error_m: float | None
    snr_db: float
    received_level_db: float
    transmission_loss_db: float
    noise_level_db: float
    directivity_index_db: float
    absorption_db_km: float
    signal_excess_db: float
    apparent_range_m: float | None
    # "detected" | "ambiguous" (echo detected but folded into the wrong listening window)
    # | "below_threshold" | "blind_zone"
    status: str

    def to_dict(self) -> dict:
        out = {}
        for k, v in asdict(self).items():
            out[k] = round(v, 3) if isinstance(v, float) else v
        return out


def evaluate_ping(
    *,
    system: str,
    ping_time_s: float,
    settings: TransmissionSettings,
    transducer: TransducerModel,
    target_id: str,
    target_range_m: float,
    target_bearing_deg: float,
    target_strength_db: float,
    true_env,
    c_true: float,
    fluctuation_db: float,
    jitter_rng: random.Random | None,
) -> PingResult:
    """Evaluate one transmission against one target.

    `fluctuation_db` must come from the shared echo-fluctuation process so that different
    systems see the same echo scenario. `jitter_rng` must be private to the calling system so
    one system's random draws can never alter another system's results.
    """
    m = model_snr_db(
        frequency_khz=settings.frequency_khz,
        pulse_duration_ms=settings.pulse_duration_ms,
        range_m=target_range_m,
        target_strength_db=target_strength_db,
        temperature_c=true_env.temperature_c,
        salinity_psu=true_env.salinity_psu,
        depth_m=true_env.depth_m,
        wind_speed_m_s=true_env.wind_speed_m_s,
        transducer=transducer,
        c=c_true,
        ph=true_env.ph,
    )
    snr_obs = m["snr"] + fluctuation_db
    excess = snr_obs - transducer.detection_threshold_db

    t_true = ac.echo_travel_time(target_range_m, c_true)
    interval_s = settings.interval_ms / 1000.0
    tau_s = settings.pulse_duration_ms / 1000.0
    # An echo arriving after the next transmission lands in a later listening window, where it
    # is indistinguishable from a closer echo of the newest pulse (range ambiguity).
    t_apparent = math.fmod(t_true, interval_s)
    ambiguous = t_true >= interval_s
    if t_apparent < tau_s:
        status = "blind_zone"
    elif excess < 0:
        status = "below_threshold"
    else:
        status = "ambiguous" if ambiguous else "detected"

    measured = est = err = None
    apparent = c_true * t_apparent / 2.0
    if status in ("detected", "ambiguous"):
        res_time = 2.0 * settings.range_resolution_m(c_true) / c_true
        sigma_t = res_time / math.sqrt(2.0 * 10 ** (max(snr_obs, 0.0) / 10.0))
        jitter = jitter_rng.gauss(0.0, sigma_t) if jitter_rng else 0.0
        measured_s = t_apparent + jitter
        measured = measured_s * 1000.0
        est = ac.range_from_echo_time(measured_s, settings.sound_speed_ref_m_s)
        err = est - target_range_m

    return PingResult(
        system=system,
        target_id=target_id,
        ping_time_s=ping_time_s,
        bearing_deg=target_bearing_deg,
        true_range_m=target_range_m,
        true_echo_time_ms=t_true * 1000.0,
        detected=status in ("detected", "ambiguous"),
        measured_echo_time_ms=measured,
        estimated_range_m=est,
        range_error_m=err,
        snr_db=snr_obs,
        received_level_db=m["rl"],
        transmission_loss_db=m["tl"],
        noise_level_db=m["nl"],
        directivity_index_db=m["di"],
        absorption_db_km=m["alpha"],
        signal_excess_db=excess,
        apparent_range_m=apparent,
        status=status,
    )


def build_ascan(
    *,
    settings: TransmissionSettings,
    c_true: float,
    echoes: list[PingResult],
    rng: random.Random,
    bins: int = 240,
) -> dict:
    """Simulated receiver output along the range axis (dB above the noise floor)."""
    max_range = settings.max_unambiguous_range_m(c_true)
    step = max_range / bins
    res = max(settings.range_resolution_m(c_true), step * 0.8)
    blind = settings.blind_range_m(c_true)
    values = []
    for i in range(bins):
        r = (i + 0.5) * step
        # Rayleigh-distributed noise envelope expressed in dB relative to its mean power.
        u = max(rng.random(), 1e-6)
        noise = 10.0 * math.log10(max(-math.log(u), 1e-4))
        level = noise
        for e in echoes:
            if e.status in ("detected", "ambiguous", "below_threshold") and e.apparent_range_m is not None:
                shape = math.exp(-0.5 * ((r - e.apparent_range_m) / res) ** 2)
                if shape > 1e-3:
                    level = 10.0 * math.log10(10 ** (level / 10.0) + shape * 10 ** (e.snr_db / 10.0))
        if r < blind:
            level = 40.0  # transmit pulse / receiver saturation during blanking
        values.append(round(level, 2))
    return {
        "max_range_m": round(max_range, 2),
        "bin_m": round(step, 3),
        "blind_range_m": round(blind, 2),
        "values": values,
    }


MAX_DISPLAY_CYCLES = 48


def build_waveform(settings: TransmissionSettings, samples: int = 480) -> dict:
    """Transmit pulse for display. Real pulses can contain thousands of carrier
    cycles; above MAX_DISPLAY_CYCLES the carrier is drawn time-compressed (flagged)."""
    tau = settings.pulse_duration_ms / 1000.0
    f0 = settings.frequency_khz * 1000.0
    true_cycles = f0 * tau
    scale = min(1.0, MAX_DISPLAY_CYCLES / true_cycles) if true_cycles > 0 else 1.0
    window = tau * 1.25
    lead = tau * 0.125
    bw = settings.bandwidth_khz * 1000.0 if settings.waveform == "LFM" else 0.0
    out = []
    for i in range(samples):
        t = i / (samples - 1) * window - lead
        if 0.0 <= t <= tau:
            x = t / tau
            # Tukey (10 %) amplitude taper to keep the spectrum tidy.
            taper = 1.0
            if x < 0.1:
                taper = 0.5 * (1 - math.cos(math.pi * x / 0.1))
            elif x > 0.9:
                taper = 0.5 * (1 - math.cos(math.pi * (1 - x) / 0.1))
            if bw:
                phase = 2 * math.pi * ((f0 - bw / 2) * t + 0.5 * (bw / tau) * t * t)
            else:
                phase = 2 * math.pi * f0 * t
            out.append(round(taper * math.sin(phase * scale), 4))
        else:
            out.append(0.0)
    return {
        "samples": out,
        "window_ms": round(window * 1000, 4),
        "lead_ms": round(lead * 1000, 4),
        "carrier_cycles": round(true_cycles, 1),
        "display_time_compression": round(1.0 / scale, 2),
        "time_compressed": scale < 1.0,
        "start_khz": round((f0 - bw / 2) / 1000, 3),
        "end_khz": round((f0 + bw / 2) / 1000, 3),
    }
