"""Water-column environment: state, limits, and the automatic dive-profile model.

In AUTO mode the vehicle follows a seeded sequence of depth waypoints at a
limited vertical speed. Temperature and salinity are then derived from a
configurable thermocline / halocline profile at the vehicle's depth, plus slow
seeded Ornstein-Uhlenbeck variability. Depth and pressure are always kept
consistent via the Saunders (1981) conversion, so the readings never
contradict each other.

The profile shape is a *demonstration assumption* (a generic mid-latitude
summer profile), not data from a specific site.
"""

from __future__ import annotations

import math
import random
from dataclasses import asdict, dataclass, field

from app.sonar.acoustics import depth_to_pressure, pressure_to_depth

# Accepted input ranges (validation). The sound-speed model's own validity range
# is narrower; values outside it are accepted but flagged.
LIMITS = {
    "temperature_c": (-2.0, 35.0),
    "depth_m": (0.0, 3000.0),
    "pressure_dbar": (0.0, 3050.0),
    "salinity_psu": (0.0, 42.0),
}


@dataclass
class EnvironmentState:
    temperature_c: float = 18.0
    depth_m: float = 20.0
    pressure_dbar: float = 20.1
    salinity_psu: float = 34.5
    latitude_deg: float = 35.0
    wind_speed_m_s: float = 6.0
    ph: float = 8.0

    def to_dict(self) -> dict:
        return {k: round(v, 4) for k, v in asdict(self).items()}


@dataclass
class ProfileConfig:
    """Assumed water-column structure used by the AUTO environment."""

    surface_temperature_c: float = 22.0
    deep_temperature_c: float = 5.0
    thermocline_depth_m: float = 110.0
    thermocline_thickness_m: float = 35.0
    surface_salinity_psu: float = 34.2
    deep_salinity_psu: float = 34.9
    max_depth_m: float = 650.0
    min_depth_m: float = 8.0
    vertical_speed_m_s: float = 1.6
    hold_seconds: tuple[float, float] = (25.0, 70.0)

    def temperature_at(self, depth_m: float, surface_offset: float = 0.0) -> float:
        t_surf = self.surface_temperature_c + surface_offset
        x = (depth_m - self.thermocline_depth_m) / self.thermocline_thickness_m
        return self.deep_temperature_c + (t_surf - self.deep_temperature_c) / (1.0 + math.exp(x))

    def salinity_at(self, depth_m: float) -> float:
        frac = 1.0 - math.exp(-depth_m / 180.0)
        return self.surface_salinity_psu + (self.deep_salinity_psu - self.surface_salinity_psu) * frac


class OUProcess:
    """Seeded Ornstein-Uhlenbeck process: smooth, mean-reverting variability."""

    def __init__(self, rng: random.Random, mean: float, sigma: float, tau_s: float, x0: float | None = None):
        self.rng, self.mean, self.sigma, self.tau = rng, mean, sigma, tau_s
        self.x = mean if x0 is None else x0

    def step(self, dt: float) -> float:
        a = dt / self.tau
        self.x += (self.mean - self.x) * a + self.sigma * math.sqrt(2.0 * a) * self.rng.gauss(0.0, 1.0)
        return self.x


@dataclass
class DivePhase:
    target_depth_m: float
    hold_s: float
    label: str


@dataclass
class AutoEnvironmentModel:
    rng: random.Random
    profile: ProfileConfig = field(default_factory=ProfileConfig)

    def __post_init__(self) -> None:
        r = self.rng
        self.surface_offset = OUProcess(r, 0.0, 0.6, 240.0)  # slow water-mass change
        self.temp_noise = OUProcess(r, 0.0, 0.12, 30.0)  # internal-wave scale wiggle
        self.sal_noise = OUProcess(r, 0.0, 0.025, 60.0)
        self.wind = OUProcess(r, 6.0, 1.5, 300.0)
        self.heave = OUProcess(r, 0.0, 0.25, 8.0)
        self.phase: DivePhase | None = None
        self.holding_for = 0.0
        self.nominal_depth = 20.0
        self.phase_changed = False

    def sync_depth(self, depth_m: float) -> None:
        """Resume the profile from the current depth (e.g. after manual control)."""
        self.nominal_depth = depth_m
        self.phase = None

    def _next_phase(self) -> DivePhase:
        p = self.profile
        r = self.rng
        current = self.nominal_depth
        # Alternate between deep and shallow legs so the vehicle repeatedly crosses the thermocline.
        if current < p.thermocline_depth_m * 1.5:
            target = r.uniform(max(p.thermocline_depth_m * 1.8, 150.0), p.max_depth_m)
            label = "Descend"
        else:
            target = r.uniform(p.min_depth_m, p.thermocline_depth_m * 0.6)
            label = "Ascend"
        return DivePhase(round(target, 1), r.uniform(*p.hold_seconds), label)

    def step(self, state: EnvironmentState, dt: float) -> EnvironmentState:
        p = self.profile
        self.phase_changed = False
        if self.phase is None:
            self.phase = self._next_phase()
            self.holding_for = 0.0
            self.phase_changed = True

        diff = self.phase.target_depth_m - self.nominal_depth
        max_move = p.vertical_speed_m_s * dt
        if abs(diff) <= max_move:
            self.nominal_depth = self.phase.target_depth_m
            self.holding_for += dt
            if self.holding_for >= self.phase.hold_s:
                self.phase = None
        else:
            self.nominal_depth += math.copysign(max_move, diff)

        depth = max(0.0, self.nominal_depth + self.heave.step(dt))
        offset = self.surface_offset.step(dt)
        temperature = p.temperature_at(depth, offset) + self.temp_noise.step(dt)
        salinity = p.salinity_at(depth) + self.sal_noise.step(dt)
        wind = max(0.0, self.wind.step(dt))
        return EnvironmentState(
            temperature_c=temperature,
            depth_m=depth,
            pressure_dbar=depth_to_pressure(depth, state.latitude_deg),
            salinity_psu=salinity,
            latitude_deg=state.latitude_deg,
            wind_speed_m_s=wind,
            ph=state.ph,
        )


def apply_manual(state: EnvironmentState, updates: dict) -> EnvironmentState:
    """Apply manual edits. Depth and pressure are two views of one quantity: editing
    either one updates the other (Saunders conversion). If both are supplied, depth wins."""
    new = EnvironmentState(**asdict(state))
    for key in ("temperature_c", "salinity_psu", "wind_speed_m_s"):
        if updates.get(key) is not None:
            setattr(new, key, float(updates[key]))
    if updates.get("depth_m") is not None:
        new.depth_m = float(updates["depth_m"])
        new.pressure_dbar = depth_to_pressure(new.depth_m, new.latitude_deg)
    elif updates.get("pressure_dbar") is not None:
        new.pressure_dbar = float(updates["pressure_dbar"])
        new.depth_m = pressure_to_depth(new.pressure_dbar, new.latitude_deg)
    return new
