"""Simulated acoustic scene: a primary tracked contact plus background contacts.

Positions are polar (range, bearing) relative to the vehicle. Motion is a seeded, bounded
random walk at plausible AUV closing speeds (a few m/s), so ranges change smoothly.

Each target also carries an echo-level fluctuation process (log-normal, time-correlated
Ornstein-Uhlenbeck in dB). Every system that pings a target at a given moment sees the
SAME fluctuation value — this is what makes adaptive-vs-fixed comparisons like-for-like.

Target strengths are assumed values chosen to give a spread of echo levels.
"""

from __future__ import annotations

import math
import random
from collections.abc import Callable
from dataclasses import dataclass

from app.sonar.environment import OUProcess

PRIMARY_RANGE_LIMITS = (30.0, 1400.0)
#: Operator repositioning rate for the manual range control. This is a scenario control,
#: not a physical vehicle/target speed.
SCENARIO_REPOSITION_M_S = 25.0


@dataclass
class Target:
    id: str
    label: str
    kind: str
    range_m: float
    bearing_deg: float
    target_strength_db: float
    radial_speed_m_s: float = 0.0
    primary: bool = False
    fluctuation_db: float = 0.0

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "kind": self.kind,
            "range_m": round(self.range_m, 2),
            "bearing_deg": round(self.bearing_deg % 360.0, 2),
            "target_strength_db": round(self.target_strength_db, 1),
            "radial_speed_m_s": round(self.radial_speed_m_s, 3),
            "primary": self.primary,
        }


class TargetScene:
    def __init__(self, rng: random.Random, fluct_rng: random.Random, fluct_sigma_db: float, fluct_corr_s: float):
        self.rng = rng
        r = rng
        self.targets: list[Target] = [
            Target(
                "T-01", "Primary contact", "Tracked object", r.uniform(140, 260), r.uniform(20, 60), -8.0, 0.0, True
            ),
            Target("T-02", "Seabed ridge", "Static structure", r.uniform(600, 900), r.uniform(150, 210), 2.0),
            Target("T-03", "Mooring line", "Static structure", r.uniform(250, 450), r.uniform(260, 320), -18.0),
            Target("T-04", "Moving contact", "Unknown", r.uniform(400, 1000), r.uniform(80, 130), -12.0),
        ]
        # Primary contact closes and opens range in long legs at ~1-4 m/s.
        self._primary_speed = OUProcess(r, 2.5, 0.6, 40.0, x0=2.5)
        self._primary_dir = 1.0
        self._bearing_drift = {t.id: OUProcess(r, 0.0, 0.3, 60.0) for t in self.targets}
        # Static structures only appear to move through vehicle motion (small); T-04 drifts ~1 m/s.
        self._range_rate = {t.id: OUProcess(r, 0.0, 1.0 if t.id == "T-04" else 0.3, 90.0) for t in self.targets[1:]}
        self._fluct = {t.id: OUProcess(fluct_rng, 0.0, fluct_sigma_db, fluct_corr_s) for t in self.targets}
        self.primary_manual_range: float | None = None
        #: Optional scripted range (time -> metres) used by reproducible benchmarks.
        self.primary_profile: Callable[[float], float] | None = None
        self.time = 0.0

    @property
    def primary(self) -> Target:
        return self.targets[0]

    def step(self, dt: float) -> None:
        self.time += dt
        lo, hi = PRIMARY_RANGE_LIMITS
        for t in self.targets:
            t.fluctuation_db = self._fluct[t.id].step(dt)
            t.bearing_deg = (t.bearing_deg + self._bearing_drift[t.id].step(dt) * dt) % 360.0
            if not t.primary:
                v = self._range_rate[t.id].step(dt)
                t.radial_speed_m_s = v
                t.range_m = min(1600.0, max(40.0, t.range_m + v * dt))
                continue
            if self.primary_profile is not None:
                new = self.primary_profile(self.time)
                t.radial_speed_m_s = (new - t.range_m) / dt if dt > 0 else 0.0
                t.range_m = new
            elif self.primary_manual_range is not None:
                diff = self.primary_manual_range - t.range_m
                move = math.copysign(min(abs(diff), SCENARIO_REPOSITION_M_S * dt), diff)
                t.radial_speed_m_s = move / dt if dt > 0 else 0.0
                t.range_m += move
            else:
                speed = abs(self._primary_speed.step(dt))
                if t.range_m >= hi * 0.92:
                    self._primary_dir = -1.0
                elif t.range_m <= max(lo * 2.5, 80.0):
                    self._primary_dir = 1.0
                t.radial_speed_m_s = self._primary_dir * speed
                t.range_m = min(hi, max(lo, t.range_m + t.radial_speed_m_s * dt))
