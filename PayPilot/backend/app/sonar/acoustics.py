"""Underwater-acoustics helper models.

All formulas are published empirical approximations. They are appropriate for
a demonstration simulator; they are NOT a substitute for calibrated
measurements of a specific transducer, water column or vehicle.

References
----------
* Mackenzie, K. V. (1981). "Nine-term equation for sound speed in the oceans."
  J. Acoust. Soc. Am. 70(3), 807-812.  Valid T 2-30 degC, S 25-40 PSU, D 0-8000 m.
* Saunders, P. M. (1981). "Practical conversion of pressure to depth."
  J. Phys. Oceanogr. 11, 573-574.
* Ainslie, M. A. & McColm, J. G. (1998). "A simplified formula for viscous and
  chemical absorption in sea water." J. Acoust. Soc. Am. 103(3), 1671-1672.
* Coates, R. (1990). "The Wenz curves" approximation of wind-generated ambient
  noise, plus thermal noise (Mellen 1952).
"""

from __future__ import annotations

import math

MACKENZIE_VALIDITY = {
    "temperature_c": (2.0, 30.0),
    "salinity_psu": (25.0, 40.0),
    "depth_m": (0.0, 8000.0),
}

#: Conventional nominal sound speed used by fixed-setting systems.
NOMINAL_SOUND_SPEED = 1500.0


def sound_speed_mackenzie(temperature_c: float, salinity_psu: float, depth_m: float) -> float:
    """Speed of sound in seawater (m/s), Mackenzie (1981) nine-term equation."""
    t, s, d = temperature_c, salinity_psu, depth_m
    return (
        1448.96
        + 4.591 * t
        - 5.304e-2 * t**2
        + 2.374e-4 * t**3
        + 1.340 * (s - 35.0)
        + 1.630e-2 * d
        + 1.675e-7 * d**2
        - 1.025e-2 * t * (s - 35.0)
        - 7.139e-13 * t * d**3
    )


def mackenzie_validity_warnings(temperature_c: float, salinity_psu: float, depth_m: float) -> list[str]:
    """Human-readable notes for inputs outside the equation's stated validity range."""
    notes = []
    for key, value, label, unit in (
        ("temperature_c", temperature_c, "Temperature", "°C"),
        ("salinity_psu", salinity_psu, "Salinity", "PSU"),
        ("depth_m", depth_m, "Depth", "m"),
    ):
        lo, hi = MACKENZIE_VALIDITY[key]
        if not lo <= value <= hi:
            notes.append(f"{label} {value:.2f} {unit} is outside the Mackenzie validity range ({lo:g}–{hi:g} {unit}).")
    return notes


def _saunders_c1(latitude_deg: float) -> float:
    return (5.92 + 5.25 * math.sin(math.radians(latitude_deg)) ** 2) * 1e-3


_SAUNDERS_C2 = 2.21e-6


def pressure_to_depth(pressure_dbar: float, latitude_deg: float = 45.0) -> float:
    """Sea pressure (dbar, gauge) -> depth (m), Saunders (1981)."""
    p = max(pressure_dbar, 0.0)
    return (1.0 - _saunders_c1(latitude_deg)) * p - _SAUNDERS_C2 * p**2


def depth_to_pressure(depth_m: float, latitude_deg: float = 45.0) -> float:
    """Depth (m) -> sea pressure (dbar, gauge); exact inverse of :func:`pressure_to_depth`."""
    z = max(depth_m, 0.0)
    a = 1.0 - _saunders_c1(latitude_deg)
    return (a - math.sqrt(a * a - 4.0 * _SAUNDERS_C2 * z)) / (2.0 * _SAUNDERS_C2)


def absorption_db_per_km(
    frequency_khz: float, temperature_c: float, salinity_psu: float, depth_m: float, ph: float = 8.0
) -> float:
    """Seawater absorption coefficient (dB/km), Ainslie & McColm (1998)."""
    f, t, s, z = frequency_khz, temperature_c, salinity_psu, depth_m / 1000.0
    f2 = f * f
    f1 = 0.78 * math.sqrt(max(s, 0.0) / 35.0) * math.exp(t / 26.0)  # boric acid relaxation (kHz)
    fm = 42.0 * math.exp(t / 17.0)  # magnesium sulphate relaxation (kHz)
    boric = 0.106 * (f1 * f2) / (f1 * f1 + f2) * math.exp((ph - 8.0) / 0.56)
    mgso4 = 0.52 * (1.0 + t / 43.0) * (s / 35.0) * (fm * f2) / (fm * fm + f2) * math.exp(-z / 6.0)
    water = 0.00049 * f2 * math.exp(-(t / 27.0 + z / 17.0))
    return boric + mgso4 + water


def one_way_transmission_loss_db(range_m: float, alpha_db_per_km: float) -> float:
    """Spherical spreading plus absorption (dB)."""
    r = max(range_m, 1.0)
    return 20.0 * math.log10(r) + alpha_db_per_km * r / 1000.0


def ambient_noise_spectrum_db(frequency_khz: float, wind_speed_m_s: float) -> float:
    """Ambient noise spectral level (dB re 1 uPa^2/Hz): wind noise + thermal noise."""
    f = max(frequency_khz, 0.1)
    wind = 50.0 + 7.5 * math.sqrt(max(wind_speed_m_s, 0.0)) + 20.0 * math.log10(f) - 40.0 * math.log10(f + 0.4)
    thermal = -15.0 + 20.0 * math.log10(f)
    return 10.0 * math.log10(10 ** (wind / 10.0) + 10 ** (thermal / 10.0))


def echo_travel_time(range_m: float, sound_speed_m_s: float) -> float:
    """Two-way travel time (s): t = 2R / c."""
    return 2.0 * range_m / sound_speed_m_s


def range_from_echo_time(echo_time_s: float, sound_speed_m_s: float) -> float:
    """Range (m) from a two-way travel time: R = c t / 2."""
    return sound_speed_m_s * echo_time_s / 2.0


def piston_directivity_index_db(frequency_khz: float, aperture_m: float, sound_speed_m_s: float = 1500.0) -> float:
    """Directivity index of a baffled circular piston of diameter D (dB).

    Uses the smooth approximation DI = 10 log10(1 + (pi D / lambda)^2), which tends to the
    textbook large-aperture result 20 log10(pi D / lambda) and to 0 dB (omnidirectional)
    when D << lambda. A fixed aperture therefore becomes more directive as frequency rises.
    """
    lam = sound_speed_m_s / (frequency_khz * 1000.0)
    x = math.pi * aperture_m / lam
    return 10.0 * math.log10(1.0 + x * x)


def piston_beamwidth_deg(frequency_khz: float, aperture_m: float, sound_speed_m_s: float = 1500.0) -> float:
    """Approximate -3 dB full beamwidth of a circular piston: ~58.9 deg x lambda / D (capped at 120 deg)."""
    lam = sound_speed_m_s / (frequency_khz * 1000.0)
    return min(120.0, 58.9 * lam / aperture_m)
