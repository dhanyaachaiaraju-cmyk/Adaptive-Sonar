import pytest

from app.sonar import acoustics as ac
from app.sonar.adaptation import AdaptationConfig
from app.sonar.engine import SimulationEngine


def run(engine: SimulationEngine, frames: int) -> None:
    for _ in range(frames):
        engine.step()


def test_same_seed_is_deterministic():
    a, b = SimulationEngine(seed=42), SimulationEngine(seed=42)
    run(a, 300)
    run(b, 300)
    strip = lambda items: [{k: v for k, v in i.items()} for i in items]  # noqa: E731
    assert strip(a.history.since(None)) == strip(b.history.since(None))
    assert [e["new"] for e in a.events.since(None)] == [e["new"] for e in b.events.since(None)]


def test_different_seed_differs():
    a, b = SimulationEngine(seed=1), SimulationEngine(seed=2)
    run(a, 50)
    run(b, 50)
    assert a.history.latest()["temperature_c"] != b.history.latest()["temperature_c"]


def test_readings_are_internally_consistent():
    e = SimulationEngine(seed=3)
    run(e, 200)
    env = e.env
    assert e.c_true == pytest.approx(ac.sound_speed_mackenzie(env.temperature_c, env.salinity_psu, env.depth_m))
    assert env.pressure_dbar == pytest.approx(ac.depth_to_pressure(env.depth_m, env.latitude_deg))
    # Measured depth is derived from measured pressure, so the measurement is self-consistent too.
    assert e.measured.depth_m == pytest.approx(ac.pressure_to_depth(e.measured.pressure_dbar, env.latitude_deg))
    checked = 0
    for _, ping, used in list(e.adaptive.pings)[-30:]:
        if ping.status == "detected":
            checked += 1
            # R = c_ref * t / 2 with the sound speed actually used for that ping.
            assert ping.estimated_range_m == pytest.approx(
                ping.measured_echo_time_ms / 1000 * used.sound_speed_ref_m_s / 2, rel=1e-9
            )
    assert checked > 0


def test_manual_environment_changes_sound_speed_and_logs():
    e = SimulationEngine(seed=5)
    before = e.c_true
    e.set_manual_environment({"temperature_c": 28.0})
    assert e.environment_mode == "manual"
    assert e.c_true > before
    assert any("Manual change" in log["message"] for log in e.logs.since(None))
    # Holding in manual mode: values stay put across frames.
    run(e, 10)
    assert e.env.temperature_c == 28.0


def test_pressure_edit_updates_depth():
    e = SimulationEngine(seed=5)
    e.set_manual_environment({"pressure_dbar": 505.0})
    assert e.env.depth_m == pytest.approx(ac.pressure_to_depth(505.0, e.env.latitude_deg))


def test_far_target_drives_lower_frequency_longer_pulse_and_interval():
    e = SimulationEngine(seed=11)
    e.set_manual_environment({"temperature_c": 12.0, "depth_m": 80.0, "salinity_psu": 35.0})
    e.set_primary_range("manual", 120.0)
    run(e, 150)
    near = e.controller.settings.copy()
    e.set_primary_range("manual", 1300.0)
    run(e, 300)
    far = e.controller.settings
    assert far.frequency_khz < near.frequency_khz
    assert far.pulse_duration_ms > near.pulse_duration_ms
    assert far.interval_ms > near.interval_ms
    assert e.last_ping.detected


def test_every_adaptation_event_is_explained():
    e = SimulationEngine(seed=7)
    run(e, 400)
    events = e.events.since(None)
    assert events
    for ev in events:
        assert ev["previous"] != ev["new"]
        assert ev["reason"] and ev["trigger"] and ev["rule"].startswith("R")
        assert ev["wall_time"] and ev["sim_time_s"] >= 0 and ev["rule_class"]


def test_fixed_mode_holds_settings():
    e = SimulationEngine(seed=9)
    e.set_adaptation_config(AdaptationConfig(enabled=False))
    settings = e.controller.settings.to_dict()
    run(e, 200)
    assert e.controller.settings.to_dict() == settings
    assert e.events.since(None) == []


def test_temperature_change_triggers_sound_speed_reference_update():
    e = SimulationEngine(seed=13)
    e.set_manual_environment({"temperature_c": 10.0})
    run(e, 20)
    e.set_manual_environment({"temperature_c": 20.0})
    run(e, 3)
    rules = [ev["rule"] for ev in e.events.since(None) if ev["sim_time_s"] > 10.0]
    assert "R1" in rules
    # R1 is applied on every ping: no residual bias is tolerated.
    assert e.controller.settings.sound_speed_ref_m_s == pytest.approx(e.c_est)


def test_reset_restores_initial_state():
    e = SimulationEngine(seed=21)
    first = (e.env.temperature_c, e.scene.primary.range_m)
    run(e, 50)
    e.reset(21)
    assert e.frame == 0 and e.state == "standby" and len(e.history) == 0
    assert (e.env.temperature_c, e.scene.primary.range_m) == first
