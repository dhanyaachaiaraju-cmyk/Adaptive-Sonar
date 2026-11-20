"""Configurable DEMONSTRATION adaptation policy for the sonar transmitter.

The controller runs once per transmitted ping and closes the loop

    measure environment -> estimate sound speed -> select parameters ->
    generate waveform -> transmit -> receive echo -> evaluate -> adapt

What is physics and what is policy
----------------------------------
PHYSICS (published models, same as the simulator):
    sound speed (Mackenzie), absorption (Ainslie-McColm), spreading loss, ambient noise,
    piston directivity, two-way travel time, range = c t / 2, resolution, blind zone,
    unambiguous range.
ENGINEERING CONSTRAINTS (hard limits, not tuning):
    the listening window must exceed the two-way travel time (R2); the pulse must end before
    the nearest echo of interest returns and respect a duty-cycle limit (R4 cap).
HEURISTIC POLICY (hand-chosen, configurable, NOT validated):
    prefer the highest frequency that still meets the SNR target; the target and hysteresis
    margins; the 1.6x window factor; the LFM threshold; the echo-loss count; smoothing.

Calibration (important limitation)
----------------------------------
The controller does not know the target strength. After every unambiguous echo it computes
    offset = measured E/N0 - predicted E/N0 (with TS = 0)
and smooths it. Predictions for other settings are "model(new settings) + offset". Because the
controller's model is the same model the simulator uses, prediction errors in this simulation
are smaller than they would be at sea: the simulation is optimistic about the controller.

Rules (evaluated in order on every ping):
R1 Sound-speed reference  physics   range conversion always uses the latest estimated c;
                                    an event is logged when it drifts beyond a threshold.
R2 Listening window       constraint interval >= guard x two-way time to the window range.
R3 Frequency              policy    highest candidate frequency whose predicted E/N0 reaches
                                    DT + target margin with a pulse no longer than the cap.
R4 Pulse duration         physics+policy  pulse set to the length predicted to reach the target
                                    margin (energy +10 log tau), within [min, cap].
R5 Waveform               policy    pulses at or above the LFM threshold use an LFM chirp so
                                    resolution is set by bandwidth rather than pulse length.
R6 Echo-loss search       policy    after N consecutive missed echoes, plan for the search range.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from pydantic import BaseModel, Field, model_validator

from app.sonar.sonar import PingResult, TransducerModel, TransmissionSettings, model_snr_db

RULE_CLASSES = {
    "R1": "physics",
    "R2": "constraint",
    "R3": "heuristic",
    "R4": "physics + heuristic",
    "R5": "heuristic",
    "R6": "heuristic",
}


class AdaptationConfig(BaseModel):
    enabled: bool = True
    frequency_steps_khz: list[float] = Field(default=[12, 18, 25, 38, 50, 70, 100], min_length=2, max_length=16)
    target_margin_db: float = Field(default=6.0, ge=0, le=30, description="Desired E/N0 above detection threshold")
    high_margin_db: float = Field(default=14.0, ge=1, le=60, description="Above this, shorten the pulse")
    frequency_up_hysteresis_db: float = Field(default=2.0, ge=0, le=20, description="Extra margin to step frequency up")
    pulse_min_ms: float = Field(default=0.2, gt=0, le=50)
    pulse_max_ms: float = Field(default=16.0, gt=0, le=100)
    lfm_threshold_ms: float = Field(default=2.0, gt=0, le=100)
    lfm_fractional_bandwidth: float = Field(default=0.3, gt=0.02, le=0.8)
    range_window_factor: float = Field(default=1.6, ge=1.05, le=5)
    min_window_m: float = Field(default=60.0, ge=5, le=2000)
    search_range_m: float = Field(default=1500.0, ge=100, le=3000)
    interval_guard: float = Field(default=1.1, ge=1.0, le=3)
    interval_min_ms: float = Field(default=60.0, ge=5, le=10_000)
    interval_max_ms: float = Field(default=4000.0, ge=10, le=20_000)
    interval_change_threshold: float = Field(default=0.08, ge=0.0, le=1)
    max_duty_cycle: float = Field(default=0.05, gt=0, le=0.5)
    blind_fraction: float = Field(default=0.5, gt=0.05, le=1)
    sound_speed_log_threshold_m_s: float = Field(default=1.0, ge=0.01, le=50)
    cooldown_pings: int = Field(default=3, ge=0, le=100)
    calibration_smoothing: float = Field(default=0.3, gt=0, le=1)
    prior_target_strength_db: float = Field(default=-10.0, ge=-60, le=30)
    lost_echo_pings: int = Field(default=4, ge=1, le=100)

    @model_validator(mode="after")
    def _check(self) -> AdaptationConfig:
        if self.pulse_min_ms >= self.pulse_max_ms:
            raise ValueError("pulse_min_ms must be less than pulse_max_ms")
        if self.interval_min_ms >= self.interval_max_ms:
            raise ValueError("interval_min_ms must be less than interval_max_ms")
        if self.target_margin_db >= self.high_margin_db:
            raise ValueError("target_margin_db must be less than high_margin_db")
        self.frequency_steps_khz = sorted({round(f, 3) for f in self.frequency_steps_khz if f > 0})
        if len(self.frequency_steps_khz) < 2:
            raise ValueError("Provide at least two positive frequency steps")
        return self


@dataclass
class AdaptationEvent:
    id: int
    ping: int
    sim_time_s: float
    wall_time: str
    rule: str
    rule_class: str
    parameter: str
    label: str
    unit: str
    previous: float | str
    new: float | str
    category: str  # environment | performance | geometry
    trigger: str
    reason: str

    def to_dict(self) -> dict:
        d = self.__dict__.copy()
        for k in ("previous", "new"):
            if isinstance(d[k], float):
                d[k] = round(d[k], 3)
        d["sim_time_s"] = round(d["sim_time_s"], 2)
        return d


@dataclass
class Decision:
    """The controller's working values for the latest ping (shown in the UI)."""

    range_of_interest_m: float = 0.0
    window_m: float = 0.0
    required_interval_ms: float = 0.0
    measured_snr_db: float | None = None
    calibration_offset_db: float | None = None
    calibrated: bool = False
    predicted_margin_db: float | None = None
    pulse_cap_ms: float = 0.0
    pulse_cap_reason: str = ""
    best_frequency_khz: float = 0.0
    best_effort: bool = False
    candidates: list = field(default_factory=list)
    searching: bool = False
    consecutive_misses: int = 0

    def to_dict(self) -> dict:
        out = {}
        for k, v in self.__dict__.items():
            out[k] = round(v, 3) if isinstance(v, float) else v
        return out


def initial_settings(c: float) -> TransmissionSettings:
    return TransmissionSettings(
        frequency_khz=38.0,
        pulse_duration_ms=1.0,
        waveform="CW",
        bandwidth_khz=1.0,
        interval_ms=1000.0,
        sound_speed_ref_m_s=c,
    )


@dataclass
class AdaptiveController:
    config: AdaptationConfig
    transducer: TransducerModel
    settings: TransmissionSettings
    previous: TransmissionSettings | None = None
    decision: Decision = field(default_factory=Decision)
    offset_db: float | None = None
    range_track_m: float | None = None
    misses: int = 0
    pings: int = 0
    last_change_ping: int = -10_000
    _c_logged: float | None = None
    _cooldown: dict = field(default_factory=dict)
    _next_id: int = 1

    # ------------------------------------------------------------------
    def _ready(self, param: str) -> bool:
        return self.pings - self._cooldown.get(param, -10_000) >= self.config.cooldown_pings

    def _event(self, ctx: dict, *, rule, parameter, label, unit, previous, new, category, trigger, reason):
        ev = AdaptationEvent(
            id=self._next_id,
            ping=self.pings,
            sim_time_s=ctx["sim_time"],
            wall_time=ctx["wall_time"],
            rule=rule,
            rule_class=RULE_CLASSES[rule],
            parameter=parameter,
            label=label,
            unit=unit,
            previous=previous,
            new=new,
            category=category,
            trigger=trigger,
            reason=reason,
        )
        self._next_id += 1
        self._cooldown[parameter] = self.pings
        return ev

    def _predict(self, f: float, tau_ms: float, r: float, measured, wind: float, c: float) -> float:
        ts = self.offset_db if self.offset_db is not None else self.config.prior_target_strength_db
        m = model_snr_db(
            frequency_khz=f,
            pulse_duration_ms=tau_ms,
            range_m=max(r, 1.0),
            target_strength_db=0.0,
            temperature_c=measured.temperature_c,
            salinity_psu=measured.salinity_psu,
            depth_m=measured.depth_m,
            wind_speed_m_s=wind,
            transducer=self.transducer,
            c=c,
        )
        return m["snr"] + ts

    def _terms(self, f: float, r: float, measured, wind: float, c: float) -> dict:
        """Read-only breakdown of the prediction for display (same model as `_predict`)."""
        m = model_snr_db(
            frequency_khz=f,
            pulse_duration_ms=1.0,
            range_m=max(r, 1.0),
            target_strength_db=0.0,
            temperature_c=measured.temperature_c,
            salinity_psu=measured.salinity_psu,
            depth_m=measured.depth_m,
            wind_speed_m_s=wind,
            transducer=self.transducer,
            c=c,
        )
        return {
            "absorption_db_km": round(m["alpha"], 3),
            "two_way_absorption_db": round(2.0 * m["alpha"] * max(r, 1.0) / 1000.0, 2),
            "two_way_spreading_db": round(2.0 * 20.0 * math.log10(max(r, 1.0)), 2),
            "noise_db": round(m["nl"], 2),
        }

    def _pulse_cap(self, c: float, roi: float) -> tuple[float, str]:
        cfg, s = self.config, self.settings
        blind = cfg.blind_fraction * 2.0 * roi / c * 1000.0
        duty = cfg.max_duty_cycle * s.interval_ms
        caps = [
            (cfg.pulse_max_ms, f"configured maximum {cfg.pulse_max_ms:g} ms"),
            (blind, f"blind zone must stay under {cfg.blind_fraction * 100:.0f} % of the {roi:.0f} m range"),
            (duty, f"duty cycle limited to {cfg.max_duty_cycle * 100:.0f} % of the {s.interval_ms:.0f} ms interval"),
        ]
        value, reason = min(caps, key=lambda x: x[0])
        return max(value, cfg.pulse_min_ms), reason

    # ------------------------------------------------------------------
    def step(self, *, measured, noise_wind_m_s: float, c_est: float, ping: PingResult, sim_time: float, wall_time: str):
        """Evaluate the ping just received and choose the settings for the next one."""
        cfg, s = self.config, self.settings
        dt_db = self.transducer.detection_threshold_db
        ctx = {"sim_time": sim_time, "wall_time": wall_time}
        events: list[AdaptationEvent] = []
        before = s.copy()
        self.pings += 1
        env_text = f"T {measured.temperature_c:.2f} °C · S {measured.salinity_psu:.2f} PSU · D {measured.depth_m:.1f} m"

        # --- Performance evaluation -----------------------------------
        measured_snr = None
        if ping.status == "detected":
            self.misses = 0
            est = ping.estimated_range_m
            self.range_track_m = est if self.range_track_m is None else 0.5 * self.range_track_m + 0.5 * est
            # Calibrate the model against what was actually measured (absorbs the unknown TS).
            predicted_ts0 = self._predict(s.frequency_khz, s.pulse_duration_ms, est, measured, noise_wind_m_s, c_est)
            predicted_ts0 -= self.offset_db if self.offset_db is not None else cfg.prior_target_strength_db
            obs = ping.snr_db - predicted_ts0
            a = cfg.calibration_smoothing
            self.offset_db = obs if self.offset_db is None else (1 - a) * self.offset_db + a * obs
            measured_snr = ping.snr_db
        else:
            # A miss (or an ambiguous echo) carries no trustworthy range or level.
            self.misses += 1
        searching = self.misses >= cfg.lost_echo_pings or self.range_track_m is None

        if not cfg.enabled:
            self.decision = Decision(measured_snr_db=measured_snr, consecutive_misses=self.misses, searching=searching)
            return events

        # --- R1 sound-speed reference (physics) -----------------------
        s.sound_speed_ref_m_s = c_est
        if self._c_logged is None:
            self._c_logged = c_est
        elif abs(c_est - self._c_logged) >= cfg.sound_speed_log_threshold_m_s:
            old = self._c_logged
            self._c_logged = c_est
            events.append(
                self._event(
                    ctx,
                    rule="R1",
                    parameter="sound_speed_ref_m_s",
                    label="Sound-speed reference",
                    unit="m/s",
                    previous=old,
                    new=c_est,
                    category="environment",
                    trigger=env_text,
                    reason=(
                        f"Estimated sound speed (Mackenzie, from measured T/S/D) moved {c_est - old:+.2f} m/s. Range "
                        f"conversion uses it on every ping; a fixed value of {old:.2f} m/s would now bias ranges by "
                        f"{(old - c_est) / c_est * 100:+.2f} %."
                    ),
                )
            )

        # --- R6 / R2 listening window ---------------------------------
        roi = cfg.search_range_m if searching else self.range_track_m
        window = max(cfg.min_window_m, roi * cfg.range_window_factor)
        two_way_ms = 2.0 * window / c_est * 1000.0
        required = min(
            cfg.interval_max_ms, max(cfg.interval_min_ms, two_way_ms * cfg.interval_guard + s.pulse_duration_ms)
        )
        rel = abs(required - s.interval_ms) / s.interval_ms
        must_grow = two_way_ms + s.pulse_duration_ms > s.interval_ms
        if (must_grow or (rel > cfg.interval_change_threshold and self._ready("interval_ms"))) and rel > 0.005:
            old = s.interval_ms
            s.interval_ms = required
            why = (
                f"{self.misses} consecutive echoes missed — planning for the {roi:.0f} m search range. "
                if searching
                else ""
            )
            events.append(
                self._event(
                    ctx,
                    rule="R6" if searching else "R2",
                    parameter="interval_ms",
                    label="Transmission interval",
                    unit="ms",
                    previous=old,
                    new=required,
                    category="geometry",
                    trigger=f"Range of interest {roi:.0f} m · c {c_est:.1f} m/s",
                    reason=(
                        f"{why}Listening window must cover {window:.0f} m: two-way travel time "
                        f"{two_way_ms:.0f} ms × {cfg.interval_guard:g} guard + pulse → {required:.0f} ms "
                        f"(unambiguous range {s.max_unambiguous_range_m(c_est):.0f} m)."
                    ),
                )
            )

        # --- R3 + R4: model-based frequency and pulse selection --------
        cap, cap_reason = self._pulse_cap(c_est, roi)
        need = dt_db + cfg.target_margin_db
        tau0 = s.pulse_duration_ms
        steps = [
            f for f in cfg.frequency_steps_khz if self.transducer.band_min_khz <= f <= self.transducer.band_max_khz
        ]
        steps = steps or cfg.frequency_steps_khz
        rows = []
        for f in steps:
            snr_tau0 = self._predict(f, tau0, roi, measured, noise_wind_m_s, c_est)
            tau_need = tau0 * 10 ** ((need - snr_tau0) / 10.0)
            rows.append(
                {
                    "frequency_khz": f,
                    "predicted_snr_at_cap_db": round(snr_tau0 + 10 * math.log10(cap / tau0), 2),
                    "pulse_needed_ms": round(tau_need, 4),
                    "feasible": tau_need <= cap,
                    "di_db": round(self.transducer.directivity_index_db(f, c_est), 1),
                    **self._terms(f, roi, measured, noise_wind_m_s, c_est),
                }
            )
        feasible = [r for r in rows if r["feasible"]]
        best_effort = not feasible
        # Highest feasible frequency; if none is feasible, the one with the best predicted E/N0 at the cap
        # (not simply the lowest: with a fixed aperture, directivity can outweigh absorption).
        best = (
            max(feasible, key=lambda r: r["frequency_khz"])
            if feasible
            else max(rows, key=lambda r: r["predicted_snr_at_cap_db"])
        )
        cur = s.frequency_khz
        choice = cur
        cur_row = next((r for r in rows if abs(r["frequency_khz"] - cur) < 1e-6), None)
        cur_ok = cur_row is not None and cur_row["feasible"]
        hyst_db = cfg.frequency_up_hysteresis_db
        if cur_row is None:
            choice = best["frequency_khz"]  # current frequency is no longer a configured step
        elif best_effort:
            # Nothing meets the target: move to the best-predicted frequency if it is clearly better.
            gain = best["predicted_snr_at_cap_db"] - cur_row["predicted_snr_at_cap_db"]
            if best["frequency_khz"] != cur and gain > hyst_db and (self._ready("frequency_khz") or searching):
                choice = best["frequency_khz"]
        elif not cur_ok and best["frequency_khz"] < cur:
            choice = best["frequency_khz"]  # current frequency cannot meet the target: step down now
        elif best["frequency_khz"] > cur and not searching and self._ready("frequency_khz"):
            if best["pulse_needed_ms"] <= cap * 10 ** (-hyst_db / 10.0):
                choice = best["frequency_khz"]
        if abs(choice - cur) > 1e-6:
            row = next(r for r in rows if r["frequency_khz"] == choice)
            if best_effort:
                why = (
                    f"No candidate frequency reaches {need:.1f} dB at {roi:.0f} m within the {cap:.2f} ms pulse cap. "
                    f"Best effort: {choice:g} kHz has the highest predicted E/N0 at the cap "
                    f"({row['predicted_snr_at_cap_db']:.1f} dB vs "
                    f"{cur_row['predicted_snr_at_cap_db']:.1f} dB at {cur:g} kHz), "
                    "balancing absorption and noise against directivity."
                    if cur_row
                    else f"Best effort: {choice:g} kHz has the highest predicted E/N0 at the cap."
                )
            elif choice < cur:
                why = (
                    f"At {cur:g} kHz the predicted E/N0 cannot reach {need:.1f} dB within the {cap:.2f} ms pulse cap "
                    f"at {roi:.0f} m; {choice:g} kHz needs {row['pulse_needed_ms']:.2f} ms."
                )
            else:
                why = (
                    f"{choice:g} kHz now meets the {need:.1f} dB target with a {row['pulse_needed_ms']:.2f} ms pulse "
                    f"(≥ {hyst_db:g} dB spare under the cap). Policy prefers the highest feasible frequency: "
                    f"narrower beam ({self.transducer.beamwidth_deg(choice, c_est):.1f}°) and finer detail."
                )
            s.frequency_khz = choice
            events.append(
                self._event(
                    ctx,
                    rule="R3",
                    parameter="frequency_khz",
                    label="Transmission frequency",
                    unit="kHz",
                    previous=cur,
                    new=choice,
                    category="environment",
                    trigger=f"{env_text} · range {roi:.0f} m",
                    reason=why,
                )
            )

        snr_now = self._predict(s.frequency_khz, tau0, roi, measured, noise_wind_m_s, c_est)
        margin_now = snr_now - dt_db
        tau_need = tau0 * 10 ** ((need - snr_now) / 10.0)
        new_tau, why = tau0, ""
        if tau0 > cap * 1.001:
            new_tau, why = cap, f"Pulse limited to {cap:.2f} ms: {cap_reason}."
        elif margin_now < cfg.target_margin_db - 0.5 or (margin_now > cfg.high_margin_db and self._ready("pulse")):
            new_tau = min(cap, max(cfg.pulse_min_ms, tau_need))
            delta = 10 * math.log10(new_tau / tau0)
            why = (
                f"Predicted margin {margin_now:.1f} dB vs target {cfg.target_margin_db:g} dB "
                f"(band up to {cfg.high_margin_db:g} dB): pulse energy {delta:+.1f} dB."
            )
            if new_tau >= cap * 0.999 and tau_need > cap:
                why += f" Limited by the cap ({cap_reason})."
        if abs(new_tau - tau0) / tau0 > 0.05:
            s.pulse_duration_ms = new_tau
            events.append(
                self._event(
                    ctx,
                    rule="R4",
                    parameter="pulse",
                    label="Pulse duration",
                    unit="ms",
                    previous=tau0,
                    new=new_tau,
                    category="performance",
                    trigger=f"Predicted margin {margin_now:.1f} dB · range {roi:.0f} m",
                    reason=why,
                )
            )

        # --- R5 waveform ----------------------------------------------
        want = "LFM" if s.pulse_duration_ms >= cfg.lfm_threshold_ms else "CW"
        bw = (
            min(
                s.frequency_khz * cfg.lfm_fractional_bandwidth,
                self.transducer.band_max_khz - self.transducer.band_min_khz,
            )
            if want == "LFM"
            else 1.0 / s.pulse_duration_ms
        )
        if want != s.waveform:
            old = s.waveform
            cw_res = c_est * s.pulse_duration_ms / 2000.0
            if want == "LFM":
                reason = (
                    f"A {s.pulse_duration_ms:.2f} ms CW pulse would resolve only {cw_res:.2f} m; "
                    f"a {bw:.1f} kHz LFM chirp compresses resolution to {c_est / (2 * bw * 1000):.3f} m. "
                    "Detection E/N0 is unchanged (same energy)."
                )
            else:
                reason = (
                    f"Pulse is short ({s.pulse_duration_ms:.2f} ms) and already resolves {cw_res:.2f} m; "
                    "CW is simpler and tolerant of Doppler."
                )
            s.waveform = want
            events.append(
                self._event(
                    ctx,
                    rule="R5",
                    parameter="waveform",
                    label="Waveform",
                    unit="",
                    previous=old,
                    new=want,
                    category="performance",
                    trigger=f"Pulse {s.pulse_duration_ms:.2f} ms vs LFM threshold {cfg.lfm_threshold_ms:g} ms",
                    reason=reason,
                )
            )
        s.bandwidth_khz = bw

        if any(e.rule != "R1" for e in events):
            self.previous = before
            self.last_change_ping = self.pings

        final_cap, final_reason = self._pulse_cap(c_est, roi)
        self.decision = Decision(
            range_of_interest_m=roi,
            window_m=window,
            required_interval_ms=required,
            measured_snr_db=measured_snr,
            calibration_offset_db=self.offset_db,
            calibrated=self.offset_db is not None,
            predicted_margin_db=self._predict(
                s.frequency_khz, s.pulse_duration_ms, roi, measured, noise_wind_m_s, c_est
            )
            - dt_db,
            pulse_cap_ms=final_cap,
            pulse_cap_reason=final_reason,
            best_frequency_khz=best["frequency_khz"],
            best_effort=best_effort,
            candidates=rows,
            searching=searching,
            consecutive_misses=self.misses,
        )
        return events

    def status_label(self) -> str:
        if not self.config.enabled:
            return "disabled"
        if self.decision.searching:
            return "searching"
        if self.pings - self.last_change_ping <= 3:
            return "adapting"
        return "stable"
