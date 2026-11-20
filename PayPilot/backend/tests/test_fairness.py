"""Audit tests for the corrected physics and the fairness of comparisons."""

import math
import random

import pytest

from app.sonar import acoustics as ac
from app.sonar.adaptation import AdaptationConfig
from app.sonar.engine import SimulationEngine
from app.sonar.environment import EnvironmentState
from app.sonar.sonar import TransducerModel, TransmissionSettings, evaluate_ping


def run(e, n):
    for _ in range(n):
        e.step()


def test_directivity_and_beamwidth_follow_frequency():
    di = [ac.piston_directivity_index_db(f, 0.15) for f in (12, 25, 50, 100)]
    bw = [ac.piston_beamwidth_deg(f, 0.15) for f in (12, 25, 50, 100)]
    assert di == sorted(di) and bw == sorted(bw, reverse=True)
    lam = 1500 / 100_000  # large-aperture limit: 20 log10(pi D / lambda)
    assert di[-1] == pytest.approx(20 * math.log10(math.pi * 0.15 / lam), abs=0.05)


def _ping(settings, r=1000.0):
    return evaluate_ping(
        system="t",
        ping_time_s=0.0,
        settings=settings,
        transducer=TransducerModel(),
        target_id="x",
        target_range_m=r,
        target_bearing_deg=0.0,
        target_strength_db=0.0,
        true_env=EnvironmentState(),
        c_true=1500.0,
        fluctuation_db=0.0,
        jitter_rng=None,
    )


def test_echo_beyond_window_is_ambiguous_not_silently_lost():
    s = TransmissionSettings(25, 4.0, "LFM", 7.5, 1000.0, 1500.0)  # 750 m window
    p = _ping(s, r=1000.0)  # 1.333 s round trip
    assert p.status == "ambiguous" and p.detected
    assert p.estimated_range_m == pytest.approx(250.0, abs=0.01)  # folded into the next window
    assert p.range_error_m == pytest.approx(-750.0, abs=0.01)


def test_cw_and_lfm_have_same_detection_energy():
    cw = _ping(TransmissionSettings(25, 4.0, "CW", 0.25, 2000.0, 1500.0))
    lfm = _ping(TransmissionSettings(25, 4.0, "LFM", 7.5, 2000.0, 1500.0))
    assert cw.snr_db == pytest.approx(lfm.snr_db)  # noise-limited: E/N0 depends on energy only


def test_pulse_energy_scales_snr():
    a = _ping(TransmissionSettings(25, 1.0, "CW", 1.0, 2000.0, 1500.0))
    b = _ping(TransmissionSettings(25, 10.0, "LFM", 7.5, 2000.0, 1500.0))
    assert b.snr_db - a.snr_db == pytest.approx(10.0)


def test_comparators_do_not_depend_on_adaptive_behaviour():
    def trace(enabled):
        e = SimulationEngine(seed=5)
        if not enabled:
            e.set_adaptation_config(AdaptationConfig(enabled=False))
        run(e, 300)
        return [(round(p.snr_db, 6), p.status, p.estimated_range_m) for sy in e.comparators for _, p, _ in sy.pings]

    assert trace(True) == trace(False)


def test_systems_share_echo_fluctuation():
    e = SimulationEngine(seed=8)
    run(e, 1)  # every system pings at t = 0; fixed_a and fixed_a_c transmit identical pulses
    assert e.comparators[0].last_ping.snr_db == e.comparators[1].last_ping.snr_db


def test_pings_follow_each_systems_interval():
    e = SimulationEngine(seed=9)
    e.set_adaptation_config(AdaptationConfig(enabled=False))
    run(e, 200)  # 100 s
    by_id = {s.id: s.ping_count for s in e.comparators}
    assert by_id["fixed_a"] == pytest.approx(101, abs=1)  # 1.0 s interval
    assert by_id["fixed_b"] == pytest.approx(34, abs=1)  # 3.0 s interval
    assert e.adaptive.ping_count == by_id["fixed_a"]  # fixed mode = Fixed A settings


def test_comparison_uses_the_same_time_window_for_all_systems():
    e = SimulationEngine(seed=10)
    run(e, 400)
    assert len({s["stats"]["window_s"] for s in e.comparison_view()["systems"]}) == 1


def test_adaptive_ranges_use_current_sound_speed():
    e = SimulationEngine(seed=11)
    run(e, 300)
    for _, _, used in e.adaptive.pings:
        assert used.sound_speed_ref_m_s != 1500.0 and used.sound_speed_ref_m_s > 1400


def test_best_effort_prefers_best_predicted_frequency():
    e = SimulationEngine(seed=12)
    e.set_manual_environment({"temperature_c": 8.0, "depth_m": 300.0})
    e.set_primary_range("manual", 1400.0)
    run(e, 500)
    d = e.controller.decision
    rows = {r["frequency_khz"]: r for r in d.candidates}
    chosen = e.controller.settings.frequency_khz
    if d.best_effort:
        best = max(rows.values(), key=lambda r: r["predicted_snr_at_cap_db"])
        hyst = e.adaptation_config.frequency_up_hysteresis_db
        assert rows[chosen]["predicted_snr_at_cap_db"] >= best["predicted_snr_at_cap_db"] - hyst - 1e-6
    else:
        assert rows[chosen]["feasible"]


def test_frequency_steps_up_only_with_an_explained_reason():
    e = SimulationEngine(seed=13)
    e.set_primary_range("manual", 1300.0)
    run(e, 600)
    for ev in e.events.since(None):
        if ev["rule"] == "R3" and ev["new"] > ev["previous"]:
            assert "meets" in ev["reason"] or "Best effort" in ev["reason"]


def test_controller_learns_target_strength_from_echoes():
    e = SimulationEngine(seed=14)
    assert e.adaptation_config.prior_target_strength_db != e.scene.primary.target_strength_db
    run(e, 200)
    # The calibration offset approximates the (unknown) TS plus fluctuation, learnt from echoes alone.
    assert e.controller.offset_db == pytest.approx(e.scene.primary.target_strength_db, abs=4.0)


def test_shared_fluctuation_is_seeded():
    a, b = SimulationEngine(seed=15), SimulationEngine(seed=15)
    run(a, 50)
    run(b, 50)
    assert [t.fluctuation_db for t in a.scene.targets] == [t.fluctuation_db for t in b.scene.targets]
    assert random.Random("15:fluct").random() == random.Random("15:fluct").random()
