"""Reproducible offline benchmark: adaptive transmitter vs fixed settings.

Why this exists
---------------
The live dashboard comparison depends on when the operator clicks things and on a sliding
window, so its numbers are neither reproducible nor representative. This benchmark:

* runs fresh, headless engines (the live simulation is untouched);
* uses SCRIPTED scenarios (deterministic contact range profile + seeded dive), identical for
  every system;
* repeats over several seeds and reports the mean with a 95 % t-interval ACROSS SEEDS
  (seeds are independent replications; individual pings are not);
* compares against the named fixed presets AND against the best single fixed setting found
  by a grid search with hindsight over the same seeds ("oracle fixed"). An adaptive system
  is only interesting if it beats or matches that oracle under changing conditions.
* reports costs alongside benefits: ping rate (update rate), mean pulse energy, resolution.

All results are SIMULATED. They depend on the assumed transducer, target strength, noise
and fluctuation models, and the controller shares the simulator's physics model.
"""

from __future__ import annotations

import math
from collections.abc import Callable

from app.sonar.engine import COMPARATORS, SimulationEngine

# Two-sided 95 % Student-t quantiles for df = 1..30.
_T95 = [
    12.706,
    4.303,
    3.182,
    2.776,
    2.571,
    2.447,
    2.365,
    2.306,
    2.262,
    2.228,
    2.201,
    2.179,
    2.160,
    2.145,
    2.131,
    2.120,
    2.110,
    2.101,
    2.093,
    2.086,
    2.080,
    2.074,
    2.069,
    2.064,
    2.060,
    2.056,
    2.052,
    2.048,
    2.045,
    2.042,
]

RANGE_BINS = [("near", 0.0, 300.0), ("mid", 300.0, 800.0), ("far", 800.0, 1e9)]

SCENARIOS = {
    "range_sweep": "Contact range sweeps 80 m → 1300 m → 80 m while the vehicle dives through the thermocline.",
    "fixed_range_dive": "Contact held at 450 m; only the water column changes (dive through the thermocline).",
    "far_contact": "Contact held at 1200 m during the dive.",
}


def _profile(name: str, duration_s: float) -> Callable[[float], float]:
    if name == "range_sweep":
        lo, hi = 80.0, 1300.0

        def f(t: float) -> float:
            x = (t % duration_s) / duration_s
            return lo + (hi - lo) * (2 * x if x < 0.5 else 2 * (1 - x))

        return f
    if name == "far_contact":
        return lambda t: 1200.0
    return lambda t: 450.0


def _fixed_grid() -> list[dict]:
    grid = []
    for f in (12, 18, 25, 38, 50, 70):
        for tau in (1.0, 4.0, 16.0):
            for interval in (1000.0, 2000.0, 4000.0):
                lfm = tau >= 2.0
                grid.append(
                    {
                        "id": f"grid_{f}_{tau:g}_{interval:g}",
                        "label": f"{f} kHz {'LFM' if lfm else 'CW'} {tau:g} ms · {interval / 1000:g} s · measured c",
                        "measured_c": True,
                        "settings": dict(
                            frequency_khz=float(f),
                            pulse_duration_ms=tau,
                            waveform="LFM" if lfm else "CW",
                            bandwidth_khz=f * 0.3 if lfm else 1.0 / tau,
                            interval_ms=interval,
                            sound_speed_ref_m_s=1500.0,
                        ),
                    }
                )
    return grid


def _mean_ci(values: list[float], bounds: tuple[float, float] | None = None) -> dict:
    vals = [v for v in values if v is not None and not math.isnan(v)]
    n = len(vals)
    if n == 0:
        return {"mean": None, "ci95": None, "n": 0}
    m = sum(vals) / n
    if n < 2:
        return {"mean": round(m, 4), "ci95": None, "n": n}
    sd = math.sqrt(sum((v - m) ** 2 for v in vals) / (n - 1))
    half = _T95[min(n - 2, len(_T95) - 1)] * sd / math.sqrt(n)
    lo, hi = m - half, m + half
    if bounds:
        lo, hi = max(bounds[0], lo), min(bounds[1], hi)
    return {"mean": round(m, 4), "ci95": [round(lo, 4), round(hi, 4)], "n": n}


def _seed_metrics(system, source_level_db: float, c: float) -> dict:
    pings = list(system.pings)
    n = len(pings)
    if n == 0:
        return {}
    det = [p for _, p, _ in pings if p.status == "detected"]
    out = {
        "detection_rate": len(det) / n,
        "ambiguous_rate": sum(1 for _, p, _ in pings if p.status == "ambiguous") / n,
        "mean_abs_range_error_m": (sum(abs(p.range_error_m) for p in det) / len(det)) if det else float("nan"),
        "pings": n,
        "mean_energy_db": 10
        * math.log10(sum(10 ** (s.pulse_energy_db(source_level_db) / 10) for _, _, s in pings) / n),
        "mean_resolution_m": sum(s.range_resolution_m(c) for _, _, s in pings) / n,
    }
    for name, lo, hi in RANGE_BINS:
        sel = [p for _, p, _ in pings if lo <= p.true_range_m < hi]
        out[f"pd_{name}"] = (sum(1 for p in sel if p.status == "detected") / len(sel)) if sel else float("nan")
    return out


def run_benchmark(
    *,
    scenario: str = "range_sweep",
    seeds: int = 5,
    base_seed: int = 1000,
    duration_s: float = 600.0,
    include_grid: bool = True,
    frame_seconds: float = 0.5,
) -> dict:
    if scenario not in SCENARIOS:
        raise ValueError(f"Unknown scenario {scenario!r}")
    grid = _fixed_grid() if include_grid else []
    per_system: dict[str, list[dict]] = {}
    labels: dict[str, str] = {"adaptive": "Adaptive transmitter"}
    labels.update({c["id"]: c["label"] for c in COMPARATORS})
    labels.update({g["id"]: g["label"] for g in grid})
    frames = int(round(duration_s / frame_seconds))
    for k in range(seeds):
        e = SimulationEngine(seed=base_seed + k, frame_seconds=frame_seconds, lightweight=True)
        e.add_comparators(grid)
        e.scene.primary_profile = _profile(scenario, duration_s)
        for _ in range(frames):
            e.step()
        c = e.c_true
        for sy in [e.adaptive, *e.comparators]:
            per_system.setdefault(sy.id, []).append(_seed_metrics(sy, e.transducer.source_level_db, c))
        ping_rate = {sy.id: sy.ping_count / e.sim_time for sy in [e.adaptive, *e.comparators]}
        for sid, rate in ping_rate.items():
            per_system[sid][-1]["ping_rate_hz"] = rate

    def summarise(sid: str) -> dict:
        rows = per_system[sid]
        keys = [
            "detection_rate",
            "ambiguous_rate",
            "mean_abs_range_error_m",
            "ping_rate_hz",
            "mean_energy_db",
            "mean_resolution_m",
            "pd_near",
            "pd_mid",
            "pd_far",
        ]
        rates = {"detection_rate", "ambiguous_rate", "pd_near", "pd_mid", "pd_far"}
        return {
            "id": sid,
            "label": labels.get(sid, sid),
            **{k: _mean_ci([r.get(k) for r in rows], (0.0, 1.0) if k in rates else None) for k in keys},
        }

    summary = {sid: summarise(sid) for sid in per_system}
    grid_ids = [g["id"] for g in grid]
    oracle = None
    if grid_ids:
        # Highest mean detection rate; ties broken by lower mean energy, then higher ping rate.
        oracle_id = max(
            grid_ids,
            key=lambda g: (
                round(summary[g]["detection_rate"]["mean"] or 0.0, 3),
                -(summary[g]["mean_energy_db"]["mean"] or 0.0),
                summary[g]["ping_rate_hz"]["mean"] or 0.0,
            ),
        )
        oracle = {
            **summary[oracle_id],
            "label": f"Oracle fixed (best of {len(grid_ids)} grid settings): {labels[oracle_id]}",
        }
    systems = [summary["adaptive"], *(summary[c["id"]] for c in COMPARATORS)]
    if oracle:
        systems.append({**oracle, "oracle": True})
    return {
        "scenario": scenario,
        "scenario_description": SCENARIOS[scenario],
        "seeds": [base_seed + k for k in range(seeds)],
        "duration_s": duration_s,
        "systems": systems,
        "range_bins_m": {name: [lo, hi if hi < 1e8 else None] for name, lo, hi in RANGE_BINS},
        "method": (
            "Simulated. Every system shares the same environment, target track and echo fluctuation in each seed. "
            "Detection = unambiguous echo above threshold, per transmitted ping. Means and 95 % t-intervals are "
            "computed across seeds (independent replications). The oracle is chosen with hindsight on the same "
            "seeds, so it is an optimistic bound for any fixed setting."
        ),
        "data_provenance": "simulated",
    }
