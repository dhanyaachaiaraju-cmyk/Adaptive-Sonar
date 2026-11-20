def test_liveness(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json()["checks"]["simulation_engine"] == "ok"


def test_security_headers_and_error_envelope(client):
    res = client.get("/api/v1/does-not-exist")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"
    assert res.headers["x-content-type-options"] == "nosniff"


def test_lifecycle_controls(client):
    assert client.get("/api/v1/simulation/state").json()["status"]["state"] == "standby"
    assert client.post("/api/v1/simulation/pause").status_code == 409
    assert client.post("/api/v1/simulation/start").json()["state"] == "running"
    assert client.post("/api/v1/simulation/start").status_code == 409
    assert client.post("/api/v1/simulation/pause").json()["state"] == "paused"
    assert client.post("/api/v1/simulation/step?frames=5").json()["frame"] == 5
    assert client.post("/api/v1/simulation/resume").json()["state"] == "running"
    res = client.post("/api/v1/simulation/reset", json={"seed": 99})
    assert res.json() == {"state": "standby", "seed": 99}


def test_live_endpoint_is_incremental(client):
    client.post("/api/v1/simulation/step?frames=10")
    live = client.get("/api/v1/simulation/live").json()
    assert len(live["history"]) == 10
    cursor = live["cursors"]["history"]
    client.post("/api/v1/simulation/step?frames=3")
    live2 = client.get(f"/api/v1/simulation/live?history_since={cursor}&logs_since={live['cursors']['logs']}").json()
    assert [h["seq"] for h in live2["history"]] == [cursor + 1, cursor + 2, cursor + 3]
    # Snapshot pieces the dashboard depends on.
    for key in ("status", "environment", "transmission", "primary", "baseline", "performance", "sonar"):
        assert key in live2
    assert live2["sonar"]["ascan"]["values"]
    assert live2["sonar"]["waveform"]["samples"]


def test_live_detects_reset(client):
    client.post("/api/v1/simulation/step?frames=10")
    client.post("/api/v1/simulation/reset", json={})
    live = client.get("/api/v1/simulation/live?history_since=10&logs_since=50").json()
    assert live["reset_detected"] is True


def test_manual_environment_validation(client):
    res = client.put("/api/v1/environment/manual", json={"temperature_c": 99})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "validation_error"
    assert client.put("/api/v1/environment/manual", json={}).status_code == 422
    res = client.put("/api/v1/environment/manual", json={"temperature_c": 15, "depth_m": 300})
    assert res.status_code == 200
    body = res.json()
    assert body["mode"] == "manual"
    assert body["truth"]["pressure_dbar"] > 300


def test_environment_mode_and_scenario(client):
    assert client.put("/api/v1/environment/mode", json={"mode": "auto"}).json()["mode"] == "auto"
    assert client.put("/api/v1/environment/scenario", json={"primary_range_mode": "manual"}).status_code == 422
    res = client.put("/api/v1/environment/scenario", json={"primary_range_mode": "manual", "primary_range_m": 900})
    assert res.json()["range_mode"] == "manual"


def test_adaptation_config_round_trip_and_validation(client):
    cfg = client.get("/api/v1/adaptation/config").json()
    cfg["target_margin_db"] = 8
    assert client.put("/api/v1/adaptation/config", json=cfg).json()["target_margin_db"] == 8
    cfg["pulse_min_ms"] = 50
    cfg["pulse_max_ms"] = 10
    assert client.put("/api/v1/adaptation/config", json=cfg).status_code == 422
    assert client.post("/api/v1/adaptation/config/reset").json()["target_margin_db"] == 6


def test_transmission_mode_fixed(client):
    res = client.put("/api/v1/transmission/mode", json={"mode": "fixed"}).json()
    assert res["operating_mode"] == "fixed"
    assert res["current"]["frequency_khz"] == 50
    client.post("/api/v1/simulation/step?frames=20")
    assert client.get("/api/v1/adaptation/events").json()["items"] == []


def test_logs_filters_and_hardware_placeholder(client):
    client.post("/api/v1/simulation/step?frames=40")
    logs = client.get("/api/v1/simulation/logs?category=status").json()["items"]
    assert logs and all(i["category"] == "status" for i in logs)
    hw = client.get("/api/v1/hardware/status").json()
    assert hw["connected"] is False and hw["implemented"] is False
    assert "STM32F446RE" in hw["controller"]
    status = client.get("/api/v1/system/status").json()
    assert status["data_provenance"] == "simulated" and status["hardware_connected"] is False


def test_hardware_feasibility_and_benchmark_endpoints(client):
    hw = client.get("/api/v1/hardware/status").json()
    names = [c["name"] for c in hw["feasibility"]["checks"]]
    assert "ADC direct sampling" in names and hw["feasibility"]["mcu"]["name"] == "STM32F446RE"
    res = client.post(
        "/api/v1/analysis/benchmark",
        json={"scenario": "far_contact", "seeds": 2, "duration_s": 60, "include_grid": False},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["data_provenance"] == "simulated" and body["seeds"] == [1000, 1001]
    assert {s["id"] for s in body["systems"]} >= {"adaptive", "fixed_a", "fixed_b"}
    assert client.post("/api/v1/analysis/benchmark", json={"seeds": 50}).status_code == 422
    comp = client.get("/api/v1/analysis/comparison").json()
    assert [s["id"] for s in comp["systems"]][:2] == ["adaptive", "fixed_a"]


def test_visualisation_fields_are_additive(client):
    client.post("/api/v1/simulation/step?frames=20")
    live = client.get("/api/v1/simulation/live").json()
    cand = live["transmission"]["adaptation"]["decision"]["candidates"][0]
    for key in ("absorption_db_km", "two_way_absorption_db", "two_way_spreading_db", "noise_db", "di_db", "feasible"):
        assert key in cand
    recent = live["comparison"]["systems"][0]["recent_pings"]
    assert recent and {"t", "status", "interval_ms", "true_echo_time_ms"} <= set(recent[0])
    ref = client.get("/api/v1/hardware/reference-pulse").json()
    assert ref["bits"] == 12 and ref["codes"] and max(ref["codes"]) <= 4095
    assert ref["data_provenance"] == "calculated"
