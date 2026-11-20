"""Simulation engine: advances environment, scene, sonar systems and controller.

Time model
----------
The engine advances in *frames* of `frame_seconds * speed` simulated seconds. Inside a frame,
each sonar SYSTEM (the adaptive transmitter and every fixed comparator) transmits on its own
schedule: a ping at t, the next at t + interval. A system with a 3 s interval therefore pings
three times less often than one with a 1 s interval — update rate is a real cost of long
listening windows and is reported, not hidden.

Fairness of comparisons
-----------------------
* Every system sees the same true environment, the same target positions and the same echo-
  level fluctuation (one shared, time-correlated process per target).
* Every system has its own private random stream for measurement jitter, so no system's
  behaviour can change another system's random draws.
* Statistics are computed over the same simulated time window for every system.

All randomness comes from `random.Random` streams derived from one seed: the same seed and
the same operator inputs at the same simulated times reproduce the same run.
"""

from __future__ import annotations

import math
import random
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.sonar import acoustics as ac
from app.sonar.adaptation import AdaptationConfig, AdaptiveController, initial_settings
from app.sonar.environment import AutoEnvironmentModel, EnvironmentState, ProfileConfig, apply_manual
from app.sonar.history import SeqBuffer
from app.sonar.sonar import (
    PingResult,
    TransducerModel,
    TransmissionSettings,
    build_ascan,
    build_waveform,
    evaluate_ping,
)
from app.sonar.targets import TargetScene
from app.sonar.telemetry import SimulatedSensors

STATS_WINDOW_S = 120.0
RECENT_PINGS = 24
MAX_PING_LOG = 4000

COMPARATORS = [
    {
        "id": "fixed_a",
        "label": "Fixed A · 50 kHz CW 1 ms · 1.0 s · c = 1500 m/s",
        "description": "Typical short-range fixed configuration with a nominal sound speed.",
        "measured_c": False,
        "settings": dict(
            frequency_khz=50.0,
            pulse_duration_ms=1.0,
            waveform="CW",
            bandwidth_khz=1.0,
            interval_ms=1000.0,
            sound_speed_ref_m_s=ac.NOMINAL_SOUND_SPEED,
        ),
    },
    {
        "id": "fixed_a_c",
        "label": "Fixed A + measured c",
        "description": "Ablation: Fixed A settings, but range conversion uses the measured sound speed.",
        "measured_c": True,
        "settings": dict(
            frequency_khz=50.0,
            pulse_duration_ms=1.0,
            waveform="CW",
            bandwidth_khz=1.0,
            interval_ms=1000.0,
            sound_speed_ref_m_s=ac.NOMINAL_SOUND_SPEED,
        ),
    },
    {
        "id": "fixed_b",
        "label": "Fixed B · 18 kHz LFM 16 ms · 3.0 s · measured c",
        "description": "Long-range fixed configuration using the adaptive system's maximum pulse energy.",
        "measured_c": True,
        "settings": dict(
            frequency_khz=18.0,
            pulse_duration_ms=16.0,
            waveform="LFM",
            bandwidth_khz=5.4,
            interval_ms=3000.0,
            sound_speed_ref_m_s=ac.NOMINAL_SOUND_SPEED,
        ),
    },
]
FIXED_MODE_SETTINGS = COMPARATORS[0]["settings"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def wilson_interval(k: int, n: int, z: float = 1.96) -> tuple[float, float] | None:
    if n == 0:
        return None
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return max(0.0, centre - half), min(1.0, centre + half)


@dataclass
class SonarSystem:
    id: str
    label: str
    description: str
    kind: str  # "adaptive" | "fixed"
    settings: TransmissionSettings
    measured_c: bool
    jitter_rng: random.Random
    next_ping_s: float = 0.0
    ping_count: int = 0
    last_ping: PingResult | None = None
    pings: deque = field(default_factory=lambda: deque(maxlen=MAX_PING_LOG))  # (time, result, settings used)

    def stats(self, now: float, window_s: float, c: float, source_level_db: float) -> dict:
        recent = [(t, p, s) for (t, p, s) in self.pings if t > now - window_s]
        n = len(recent)
        det = sum(1 for _, p, _ in recent if p.status == "detected")
        amb = sum(1 for _, p, _ in recent if p.status == "ambiguous")
        errs = [abs(p.range_error_m) for _, p, _ in recent if p.status == "detected"]
        ci = wilson_interval(det, n)
        span = min(window_s, now) if now > 0 else 0.0
        energy = None
        if n:
            energy = 10 * math.log10(sum(10 ** (s.pulse_energy_db(source_level_db) / 10) for _, _, s in recent) / n)
        return {
            "pings": n,
            "window_s": round(span, 1),
            "detection_rate": round(det / n, 4) if n else None,
            "detection_ci95": [round(ci[0], 4), round(ci[1], 4)] if ci else None,
            "ambiguous_rate": round(amb / n, 4) if n else None,
            "mean_abs_range_error_m": round(sum(errs) / len(errs), 3) if errs else None,
            "mean_snr_db": round(sum(p.snr_db for _, p, _ in recent) / n, 2) if n else None,
            "ping_rate_hz": round(n / span, 3) if span > 0 else None,
            "mean_energy_db": round(energy, 2) if energy is not None else None,
            "mean_resolution_m": round(sum(s.range_resolution_m(c) for _, _, s in recent) / n, 4) if n else None,
        }


class SimulationEngine:
    def __init__(
        self,
        *,
        seed: int = 1729,
        frame_seconds: float = 0.5,
        history_size: int = 1200,
        log_size: int = 2000,
        lightweight: bool = False,
    ):
        self.frame_seconds = frame_seconds
        self.lightweight = lightweight  # benchmark mode: skip display-only work
        self.history = SeqBuffer(history_size)
        self.logs = SeqBuffer(log_size)
        self.events = SeqBuffer(500)
        self.adaptation_config = AdaptationConfig()
        self.transducer = TransducerModel()
        self.profile = ProfileConfig()
        self.speed = 1.0
        self.reset(seed, log=False)

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def _rng(self, name: str) -> random.Random:
        return random.Random(f"{self.seed}:{name}")

    def reset(self, seed: int | None = None, *, log: bool = True) -> None:
        if seed is not None:
            self.seed = int(seed)
        self.state = "standby"
        self.frame = 0
        self.sim_time = 0.0
        self.environment_mode = "auto"
        self.env = EnvironmentState()
        self.env_model = AutoEnvironmentModel(self._rng("env"), self.profile)
        self.env_model.sync_depth(self.env.depth_m)
        self.env = self.env_model.step(self.env, 0.0)
        self.scene = TargetScene(
            self._rng("scene"), self._rng("fluct"), self.transducer.fluctuation_db, self.transducer.fluctuation_corr_s
        )
        self.sensors = SimulatedSensors(self._rng("sensor"))
        self.measured = self.sensors.read(self.env)
        self.c_true = self._c(self.env)
        self.c_est = self._c(self.measured)
        self.controller = AdaptiveController(
            config=self.adaptation_config, transducer=self.transducer, settings=initial_settings(self.c_est)
        )
        self.adaptive = SonarSystem(
            id="adaptive",
            label="Adaptive transmitter",
            description="Settings chosen by rules R1–R6.",
            kind="adaptive",
            settings=self.controller.settings,
            measured_c=True,
            jitter_rng=self._rng("jitter:adaptive"),
        )
        self.comparators = [
            SonarSystem(
                id=c["id"],
                label=c["label"],
                description=c["description"],
                kind="fixed",
                settings=TransmissionSettings(**c["settings"]),
                measured_c=c["measured_c"],
                jitter_rng=self._rng(f"jitter:{c['id']}"),
            )
            for c in COMPARATORS
        ]
        self.scan_rng = self._rng("scan")
        self.ascan_rng = self._rng("ascan")
        self.beam_bearing = 0.0
        self.contacts: dict[str, dict] = {}
        self.ascan: dict | None = None
        self._flags: dict[str, bool] = {}
        self._last_logged_c = self.c_true
        self._above_thermocline = self.env.depth_m < self.profile.thermocline_depth_m
        self.history.clear()
        self.events.clear()
        if log:
            self.logs.clear()
            self.log("status", "info", f"Simulation reset (seed {self.seed}). System in standby.")
        else:
            self.log("status", "info", f"Simulation engine initialised (seed {self.seed}). System in standby.")

    def add_comparators(self, defs: list[dict]) -> None:
        """Add extra fixed systems (used by the offline benchmark's fixed-setting grid)."""
        for c in defs:
            self.comparators.append(
                SonarSystem(
                    id=c["id"],
                    label=c["label"],
                    description=c.get("description", ""),
                    kind="fixed",
                    settings=TransmissionSettings(**c["settings"]),
                    measured_c=c.get("measured_c", True),
                    jitter_rng=self._rng(f"jitter:{c['id']}"),
                )
            )

    # Convenience accessors ----------------------------------------------
    @property
    def last_ping(self) -> PingResult | None:
        return self.adaptive.last_ping

    @property
    def last_baseline(self) -> PingResult | None:
        return self.comparators[0].last_ping

    @property
    def ping_count(self) -> int:
        return self.adaptive.ping_count

    def start(self) -> None:
        self.state = "running"
        self.log("status", "info", "Simulation started. Transmitter active (simulated).")

    def pause(self) -> None:
        self.state = "paused"
        self.log("status", "info", f"Simulation paused at t = {self.sim_time:.1f} s.")

    def resume(self) -> None:
        self.state = "running"
        self.log("status", "info", f"Simulation resumed at t = {self.sim_time:.1f} s.")

    # ------------------------------------------------------------------
    # Operator inputs
    # ------------------------------------------------------------------
    def set_speed(self, speed: float) -> None:
        self.speed = speed
        self.log("simulation", "info", f"Simulation speed set to {speed:g}×.")

    def set_environment_mode(self, mode: str) -> None:
        if mode == self.environment_mode:
            return
        self.environment_mode = mode
        if mode == "auto":
            self.env_model.sync_depth(self.env.depth_m)
            self.log("environment", "info", "Automatic environment simulation enabled (dive profile resumed).")
        else:
            self.log("environment", "info", "Manual environment control enabled. Values held until changed.")

    def set_manual_environment(self, updates: dict) -> dict:
        if self.environment_mode != "manual":
            self.set_environment_mode("manual")
        old = self.env
        self.env = apply_manual(old, updates)
        self._refresh_environment()
        changes = []
        for key, label, unit in (
            ("temperature_c", "Temperature", "°C"),
            ("depth_m", "Depth", "m"),
            ("pressure_dbar", "Pressure", "dbar"),
            ("salinity_psu", "Salinity", "PSU"),
            ("wind_speed_m_s", "Wind", "m/s"),
        ):
            a, b = getattr(old, key), getattr(self.env, key)
            if abs(a - b) > 1e-9:
                changes.append(f"{label} {a:.2f} → {b:.2f} {unit}")
        if changes:
            self.log(
                "environment",
                "info",
                "Manual change: " + "; ".join(changes) + f". Sound speed now {self.c_true:.2f} m/s.",
            )
        return self.env.to_dict()

    def set_primary_range(self, mode: str, range_m: float | None) -> None:
        if mode == "manual" and range_m is not None:
            self.scene.primary_manual_range = range_m
            self.log("simulation", "info", f"Primary contact range set manually to {range_m:.0f} m.")
        else:
            self.scene.primary_manual_range = None
            self.log("simulation", "info", "Primary contact motion returned to automatic.")

    def set_adaptation_config(self, cfg: AdaptationConfig) -> None:
        was = self.adaptation_config.enabled
        self.adaptation_config = cfg
        self.controller.config = cfg
        if was and not cfg.enabled:
            self.controller.previous = self.controller.settings.copy()
            self.controller.settings = TransmissionSettings(**FIXED_MODE_SETTINGS)
            self.adaptive.settings = self.controller.settings
            self.log("adaptation", "warning", "Adaptation disabled: transmitter locked to the Fixed A settings.")
        elif not was and cfg.enabled:
            self.log("adaptation", "info", "Adaptation enabled: transmitter parameters will follow conditions.")
        else:
            self.log("adaptation", "info", "Adaptation configuration updated.")

    # ------------------------------------------------------------------
    # Frame
    # ------------------------------------------------------------------
    @staticmethod
    def _c(m) -> float:
        return ac.sound_speed_mackenzie(m.temperature_c, m.salinity_psu, m.depth_m)

    def _refresh_environment(self) -> None:
        self.c_true = self._c(self.env)
        self.measured = self.sensors.read(self.env)
        self.c_est = self._c(self.measured)

    def _ping(
        self,
        system: SonarSystem,
        target,
        t: float,
        settings: TransmissionSettings | None = None,
        rng: random.Random | None = None,
        use_system_rng: bool = True,
    ) -> PingResult:
        return evaluate_ping(
            system=system.id,
            ping_time_s=t,
            settings=settings or system.settings,
            transducer=self.transducer,
            target_id=target.id,
            target_range_m=target.range_m,
            target_bearing_deg=target.bearing_deg,
            target_strength_db=target.target_strength_db,
            true_env=self.env,
            c_true=self.c_true,
            fluctuation_db=target.fluctuation_db,
            jitter_rng=rng if rng is not None else (system.jitter_rng if use_system_rng else None),
        )

    def step(self) -> dict:
        dt = self.frame_seconds * self.speed
        self.frame += 1
        frame_start = self.sim_time
        self.sim_time += dt
        wall = _now()

        # 1-3 environment, scene, sensing (held constant within the frame)
        if self.environment_mode == "auto":
            self.env = self.env_model.step(self.env, dt)
            if self.env_model.phase_changed and self.env_model.phase:
                ph = self.env_model.phase
                self.log("environment", "info", f"Dive profile: {ph.label.lower()} to {ph.target_depth_m:.0f} m.")
        self.scene.step(dt)
        self._refresh_environment()
        if not self.lightweight:
            self._environment_logs()

        primary = self.scene.primary
        n_events = 0
        adaptive_pinged = False

        # 4 fixed comparators, each on its own schedule
        for sy in self.comparators:
            while sy.next_ping_s <= self.sim_time:
                t = max(sy.next_ping_s, frame_start)
                if sy.measured_c:
                    sy.settings.sound_speed_ref_m_s = self.c_est
                res = self._ping(sy, primary, t)
                sy.last_ping, sy.ping_count = res, sy.ping_count + 1
                sy.pings.append((t, res, sy.settings.copy()))
                sy.next_ping_s = t + sy.settings.interval_ms / 1000.0

        # 5 adaptive transmitter: ping, scan step, evaluate + adapt, schedule the next ping
        a = self.adaptive
        while a.next_ping_s <= self.sim_time:
            t = max(a.next_ping_s, frame_start)
            a.settings = self.controller.settings
            if self.adaptation_config.enabled:
                # R1 (physics): convert this echo with the sound speed measured now, not at the last ping.
                a.settings.sound_speed_ref_m_s = self.c_est
            used = a.settings.copy()
            res = self._ping(a, primary, t, settings=used)
            a.last_ping, a.ping_count = res, a.ping_count + 1
            a.pings.append((t, res, used))
            adaptive_pinged = True
            self._scan_step(used, t)
            events = self.controller.step(
                measured=self.measured,
                noise_wind_m_s=self.env.wind_speed_m_s,
                c_est=self.c_est,
                ping=res,
                sim_time=t,
                wall_time=wall,
            )
            n_events += len(events)
            for ev in events:
                self.events.append(ev.to_dict())
                prev = f"{ev.previous:.2f}" if isinstance(ev.previous, float) else ev.previous
                new = f"{ev.new:.2f}" if isinstance(ev.new, float) else ev.new
                self.log("adaptation", "info", f"[{ev.rule}] {ev.label}: {prev} → {new} {ev.unit}. {ev.reason}".strip())
            if not self.lightweight:
                self._ping_logs(res, used)
            a.settings = self.controller.settings
            a.next_ping_s = t + a.settings.interval_ms / 1000.0

        if adaptive_pinged and not self.lightweight:
            self._build_ascan()
        if not self.lightweight:
            self._record_history(n_events)
        return {"frame": self.frame, "events": n_events}

    def _scan_step(self, settings: TransmissionSettings, t: float) -> None:
        """The scanning receive beam steps one beamwidth per adaptive ping."""
        bw = self.transducer.beamwidth_deg(settings.frequency_khz, self.c_true)
        for tgt in self.scene.targets:
            off = abs(((tgt.bearing_deg - self.beam_bearing) + 180) % 360 - 180)
            if off <= bw / 2:
                r = self._ping(self.adaptive, tgt, t, settings=settings, rng=self.scan_rng)
                self.contacts[tgt.id] = {**r.to_dict(), "label": tgt.label, "sim_time_s": round(t, 2)}
        self.beam_bearing = (self.beam_bearing + bw) % 360.0

    def _build_ascan(self) -> None:
        last = self.adaptive.last_ping
        used = self.adaptive.pings[-1][2]
        bw = self.transducer.beamwidth_deg(used.frequency_khz, self.c_true)
        echoes = [last]
        p = self.scene.primary
        for tgt in self.scene.targets[1:]:
            if abs(((tgt.bearing_deg - p.bearing_deg) + 180) % 360 - 180) <= bw / 2:
                echoes.append(self._ping(self.adaptive, tgt, last.ping_time_s, settings=used, use_system_rng=False))
        self.ascan = build_ascan(settings=used, c_true=self.c_true, echoes=echoes, rng=self.ascan_rng)

    def _record_history(self, n_events: int) -> None:
        s = self.controller.settings
        ping = self.adaptive.last_ping
        base = self.comparators[0].last_ping
        valid = ping is not None and ping.status == "detected"
        base_valid = base is not None and base.status == "detected"
        self.history.append(
            {
                "frame": self.frame,
                "t": round(self.sim_time, 2),
                "temperature_c": round(self.env.temperature_c, 3),
                "depth_m": round(self.env.depth_m, 2),
                "pressure_dbar": round(self.env.pressure_dbar, 2),
                "salinity_psu": round(self.env.salinity_psu, 3),
                "sound_speed_m_s": round(self.c_true, 3),
                "sound_speed_est_m_s": round(self.c_est, 3),
                "frequency_khz": s.frequency_khz,
                "pulse_duration_ms": round(s.pulse_duration_ms, 4),
                "interval_ms": round(s.interval_ms, 2),
                "waveform": s.waveform,
                "ping_count": self.adaptive.ping_count,
                "echo_time_ms": round(ping.measured_echo_time_ms, 3) if valid else None,
                "true_echo_time_ms": round(ping.true_echo_time_ms, 3) if ping else None,
                "range_true_m": round(self.scene.primary.range_m, 2),
                "range_est_m": round(ping.estimated_range_m, 2) if valid else None,
                "snr_db": round(ping.snr_db, 2) if ping else None,
                "detected": valid,
                "baseline_snr_db": round(base.snr_db, 2) if base else None,
                "baseline_detected": base_valid,
                "baseline_range_est_m": round(base.estimated_range_m, 2) if base_valid else None,
                "adaptations": n_events,
            }
        )

    # ------------------------------------------------------------------
    # Logging helpers
    # ------------------------------------------------------------------
    def log(self, category: str, level: str, message: str) -> None:
        if self.lightweight:
            return
        self.logs.append(
            {
                "wall_time": _now(),
                "sim_time_s": round(getattr(self, "sim_time", 0.0), 2),
                "frame": getattr(self, "frame", 0),
                "category": category,
                "level": level,
                "message": message,
            }
        )

    def _edge(self, key: str, active: bool) -> int:
        was = self._flags.get(key, False)
        self._flags[key] = active
        return (active and not was) - (was and not active)

    def _environment_logs(self) -> None:
        if abs(self.c_true - self._last_logged_c) >= 3.0:
            self.log(
                "environment",
                "info",
                f"Sound speed {self._last_logged_c:.1f} → {self.c_true:.1f} m/s "
                f"(T {self.env.temperature_c:.2f} °C, S {self.env.salinity_psu:.2f} PSU, D {self.env.depth_m:.0f} m).",
            )
            self._last_logged_c = self.c_true
        above = self.env.depth_m < self.profile.thermocline_depth_m
        if above != self._above_thermocline and self.environment_mode == "auto":
            self.log(
                "environment",
                "info",
                f"Vehicle {'rose above' if above else 'descended through'} the thermocline "
                f"(~{self.profile.thermocline_depth_m:.0f} m); water now {self.env.temperature_c:.1f} °C.",
            )
        self._above_thermocline = above
        notes = ac.mackenzie_validity_warnings(self.env.temperature_c, self.env.salinity_psu, self.env.depth_m)
        edge = self._edge("validity", bool(notes))
        if edge > 0:
            self.log("environment", "warning", " ".join(notes) + " Sound-speed estimate is extrapolated.")
        elif edge < 0:
            self.log("environment", "info", "Environment back inside the sound-speed model's validity range.")

    def _ping_logs(self, ping: PingResult, used: TransmissionSettings) -> None:
        lost = self.controller.misses >= self.adaptation_config.lost_echo_pings
        edge = self._edge("echo_lost", lost)
        if edge > 0:
            self.log(
                "transmission",
                "warning",
                f"Echo from primary contact lost for {self.controller.misses} consecutive pings "
                f"(last status: {ping.status.replace('_', ' ')}).",
            )
        elif edge < 0 and ping.estimated_range_m is not None:
            self.log(
                "transmission", "info", f"Echo reacquired at {ping.estimated_range_m:.1f} m, E/N0 {ping.snr_db:.1f} dB."
            )
        if self._edge("ambiguous", ping.status == "ambiguous") > 0:
            self.log("transmission", "warning", "Echo arrived after the next transmission: range ambiguous.")
        if self._edge("low_margin", ping.status == "detected" and ping.signal_excess_db < 3.0) > 0:
            self.log("transmission", "warning", f"Low signal excess: {ping.signal_excess_db:.1f} dB above threshold.")
        base = self.comparators[0].last_ping
        if base and self._edge("baseline_ambiguous", base.status == "ambiguous") > 0:
            self.log(
                "transmission",
                "warning",
                f"Fixed A: contact at {base.true_range_m:.0f} m is beyond its "
                f"{self.comparators[0].settings.max_unambiguous_range_m(self.c_true):.0f} m window — range ambiguous.",
            )
        if self.adaptive.ping_count % 10 == 0:
            echo = (
                f"echo {ping.measured_echo_time_ms:.2f} ms → {ping.estimated_range_m:.1f} m"
                if ping.status == "detected"
                else f"no valid echo ({ping.status.replace('_', ' ')})"
            )
            self.log(
                "transmission",
                "info",
                f"Ping #{self.adaptive.ping_count}: {used.frequency_khz:g} kHz {used.waveform} "
                f"{used.pulse_duration_ms:.2f} ms, interval {used.interval_ms:.0f} ms; {echo}; "
                f"E/N0 {ping.snr_db:.1f} dB.",
            )

    # ------------------------------------------------------------------
    # Read models
    # ------------------------------------------------------------------
    def system_stats(self, system: SonarSystem) -> dict:
        return system.stats(self.sim_time, STATS_WINDOW_S, self.c_true, self.transducer.source_level_db)

    def health(self) -> dict:
        reasons, level = [], "nominal"
        if ac.mackenzie_validity_warnings(self.env.temperature_c, self.env.salinity_psu, self.env.depth_m):
            level = "caution"
            reasons.append("Environment outside sound-speed model validity range")
        lp = self.adaptive.last_ping
        if self.controller.decision.searching and self.adaptive.ping_count > 0:
            level = "warning"
            reasons.append("Primary echo lost — searching")
        elif lp and lp.status == "detected" and lp.signal_excess_db < 3.0:
            level = "caution" if level == "nominal" else level
            reasons.append("Low signal excess")
        return {"level": level, "reasons": reasons}

    def transmission_view(self) -> dict:
        s, c = self.controller.settings, self.c_est
        prev = self.controller.previous
        return {
            "operating_mode": "adaptive" if self.adaptation_config.enabled else "fixed",
            "current": s.to_dict(),
            "previous": prev.to_dict() if prev else None,
            "derived": {
                "range_resolution_m": round(s.range_resolution_m(c), 4),
                "max_unambiguous_range_m": round(s.max_unambiguous_range_m(c), 1),
                "blind_range_m": round(s.blind_range_m(c), 3),
                "duty_cycle": round(s.pulse_duration_ms / s.interval_ms, 5),
                "ping_rate_hz": round(1000.0 / s.interval_ms, 3),
                "source_level_db": self.transducer.source_level_db,
                "pulse_energy_db": round(s.pulse_energy_db(self.transducer.source_level_db), 2),
                "directivity_index_db": round(self.transducer.directivity_index_db(s.frequency_khz, c), 2),
                "beamwidth_deg": round(self.transducer.beamwidth_deg(s.frequency_khz, c), 2),
            },
            "adaptation": {
                "enabled": self.adaptation_config.enabled,
                "status": self.controller.status_label(),
                "last_change_ping": self.controller.last_change_ping if self.controller.last_change_ping > 0 else None,
                "decision": self.controller.decision.to_dict(),
            },
        }

    def comparison_view(self) -> dict:
        systems = [self.adaptive, *self.comparators]
        return {
            "window_s": STATS_WINDOW_S,
            "note": (
                "Simulated. Same environment, targets and echo fluctuation for every system; each system pings at "
                "its own interval. Consecutive pings are correlated, so the 95 % intervals are optimistic."
            ),
            "systems": [
                {
                    "id": sy.id,
                    "label": sy.label,
                    "description": sy.description,
                    "kind": sy.kind,
                    "settings": sy.settings.to_dict(),
                    "last_ping": sy.last_ping.to_dict() if sy.last_ping else None,
                    "stats": self.system_stats(sy),
                    "recent_pings": [
                        {
                            "t": round(t, 3),
                            "status": p.status,
                            "interval_ms": round(st.interval_ms, 2),
                            "pulse_ms": round(st.pulse_duration_ms, 4),
                            "true_echo_time_ms": round(p.true_echo_time_ms, 3),
                            "measured_echo_time_ms": None
                            if p.measured_echo_time_ms is None
                            else round(p.measured_echo_time_ms, 3),
                            "snr_db": round(p.snr_db, 2),
                        }
                        for (t, p, st) in list(sy.pings)[-RECENT_PINGS:]
                    ],
                }
                for sy in systems
            ],
        }

    def snapshot(self) -> dict:
        p = self.scene.primary
        ping = self.adaptive.last_ping
        comp = self.comparison_view()
        s = self.controller.settings
        bw = self.transducer.beamwidth_deg(s.frequency_khz, self.c_true)
        base = self.comparators[0]
        return {
            "status": {
                "state": self.state,
                "frame": self.frame,
                "sim_time_s": round(self.sim_time, 2),
                "seed": self.seed,
                "speed": self.speed,
                "frame_seconds": self.frame_seconds,
                "operating_mode": "adaptive" if self.adaptation_config.enabled else "fixed",
                "environment_mode": self.environment_mode,
                "telemetry_source": self.sensors.name,
                "ping_count": self.adaptive.ping_count,
                "health": self.health(),
                "data_provenance": "simulated",
            },
            "environment": {
                "mode": self.environment_mode,
                "truth": self.env.to_dict(),
                "measured": self.measured.to_dict(),
                "sound_speed_m_s": round(self.c_true, 3),
                "sound_speed_measured_m_s": round(self.c_est, 3),
                "sound_speed_model": "Mackenzie (1981) nine-term equation",
                "pressure_model": "Saunders (1981) depth–pressure conversion",
                "validity_warnings": ac.mackenzie_validity_warnings(
                    self.env.temperature_c, self.env.salinity_psu, self.env.depth_m
                ),
                "dive_phase": (
                    {"label": self.env_model.phase.label, "target_depth_m": self.env_model.phase.target_depth_m}
                    if self.environment_mode == "auto" and self.env_model.phase
                    else None
                ),
                "thermocline_depth_m": self.profile.thermocline_depth_m,
            },
            "transmission": self.transmission_view(),
            "primary": {
                "target": p.to_dict(),
                "range_mode": "manual" if self.scene.primary_manual_range is not None else "auto",
                "manual_range_m": self.scene.primary_manual_range,
                "tracked_range_m": None
                if self.controller.range_track_m is None
                else round(self.controller.range_track_m, 2),
                "last_ping": ping.to_dict() if ping else None,
            },
            "baseline": {
                "settings": base.settings.to_dict(),
                "label": base.label,
                "last_ping": base.last_ping.to_dict() if base.last_ping else None,
                "description": base.description,
            },
            "comparison": comp,
            "performance": {
                "window_s": STATS_WINDOW_S,
                "adaptive": comp["systems"][0]["stats"],
                "baseline": comp["systems"][1]["stats"],
            },
            "sonar": {
                "beam_bearing_deg": round(self.beam_bearing, 2),
                "scan_rate_deg_s": round(bw / (s.interval_ms / 1000.0) * self.speed, 3),
                "beamwidth_deg": round(bw, 2),
                "transducer": {
                    **self.transducer.to_dict(),
                    "directivity_index_db": round(
                        self.transducer.directivity_index_db(s.frequency_khz, self.c_true), 2
                    ),
                },
                "contacts": list(self.contacts.values()),
                "targets_truth": [t.to_dict() for t in self.scene.targets],
                "ascan": self.ascan,
                "waveform": build_waveform(s),
            },
            "cursors": {"history": self.history.seq, "logs": self.logs.seq, "events": self.events.seq},
        }
