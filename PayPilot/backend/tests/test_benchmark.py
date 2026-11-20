from app.sonar.evaluation import run_benchmark


def test_benchmark_is_reproducible_and_reports_costs():
    a = run_benchmark(scenario="range_sweep", seeds=2, duration_s=120, include_grid=False)
    b = run_benchmark(scenario="range_sweep", seeds=2, duration_s=120, include_grid=False)
    assert a == b
    ids = [s["id"] for s in a["systems"]]
    assert ids[:4] == ["adaptive", "fixed_a", "fixed_a_c", "fixed_b"]
    for s in a["systems"]:
        for key in ("detection_rate", "ping_rate_hz", "mean_energy_db", "mean_resolution_m"):
            assert s[key]["n"] == 2
        lo, hi = s["detection_rate"]["ci95"]
        assert 0.0 <= lo <= hi <= 1.0


def test_benchmark_includes_oracle_fixed_setting():
    r = run_benchmark(scenario="far_contact", seeds=2, duration_s=90, include_grid=True)
    oracle = r["systems"][-1]
    assert oracle.get("oracle") and oracle["label"].startswith("Oracle fixed")


def test_sound_speed_ablation_isolates_range_bias():
    r = run_benchmark(scenario="fixed_range_dive", seeds=2, duration_s=120, include_grid=False)
    by = {s["id"]: s for s in r["systems"]}
    # Same transmit settings; only the sound speed used for range conversion differs.
    assert by["fixed_a"]["detection_rate"]["mean"] == by["fixed_a_c"]["detection_rate"]["mean"]
    assert by["fixed_a"]["mean_abs_range_error_m"]["mean"] > 10 * by["fixed_a_c"]["mean_abs_range_error_m"]["mean"]
