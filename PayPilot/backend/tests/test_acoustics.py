import math

import pytest

from app.sonar import acoustics as ac


def test_mackenzie_published_check_value():
    # Mackenzie (1981): 1550.744 m/s at 25 degC, 35 PSU, 1000 m.
    assert ac.sound_speed_mackenzie(25, 35, 1000) == pytest.approx(1550.744, abs=1e-3)


def test_sound_speed_increases_with_temperature_salinity_and_depth():
    base = ac.sound_speed_mackenzie(10, 35, 100)
    assert ac.sound_speed_mackenzie(11, 35, 100) > base
    assert ac.sound_speed_mackenzie(10, 36, 100) > base
    assert ac.sound_speed_mackenzie(10, 35, 200) > base


def test_validity_warnings():
    assert ac.mackenzie_validity_warnings(10, 35, 100) == []
    notes = ac.mackenzie_validity_warnings(-1, 20, 100)
    assert len(notes) == 2


@pytest.mark.parametrize("depth", [0, 10, 250, 1000, 2500])
def test_depth_pressure_round_trip(depth):
    p = ac.depth_to_pressure(depth, 35)
    assert ac.pressure_to_depth(p, 35) == pytest.approx(depth, abs=1e-6)
    if depth:
        assert p > depth  # 1 dbar is slightly less than 1 m of seawater


def test_absorption_increases_with_frequency():
    values = [ac.absorption_db_per_km(f, 10, 35, 100) for f in (5, 10, 25, 50, 100)]
    assert values == sorted(values)
    # Order of magnitude check: ~1 dB/km at 10 kHz, ~30-40 dB/km at 100 kHz.
    assert 0.5 < values[1] < 1.5
    assert 25 < values[-1] < 45


def test_echo_time_formula_and_inverse():
    t = ac.echo_travel_time(750.0, 1500.0)
    assert t == pytest.approx(1.0)
    assert ac.range_from_echo_time(t, 1500.0) == pytest.approx(750.0)


def test_transmission_loss_spherical_spreading():
    assert ac.one_way_transmission_loss_db(100, 0) == pytest.approx(40.0)
    assert ac.one_way_transmission_loss_db(1000, 10) == pytest.approx(60.0 + 10.0)
    assert math.isfinite(ac.ambient_noise_spectrum_db(50, 6))
