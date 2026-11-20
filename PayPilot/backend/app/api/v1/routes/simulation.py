"""Simulation lifecycle, live state, history and logs."""

from typing import Literal

from fastapi import APIRouter, Query

from app.api.deps import RunnerDep
from app.api.schemas import ResetRequest, SimulationSettingsRequest
from app.core.errors import ConflictError

router = APIRouter(prefix="/simulation", tags=["simulation"])


@router.get("/state", summary="Full current simulation snapshot")
async def get_state(runner: RunnerDep) -> dict:
    async with runner.lock:
        return runner.engine.snapshot()


@router.get("/live", summary="Snapshot plus history/log/adaptation entries newer than the given cursors")
async def get_live(
    runner: RunnerDep,
    history_since: int | None = Query(default=None, ge=0),
    logs_since: int | None = Query(default=None, ge=0),
    events_since: int | None = Query(default=None, ge=0),
) -> dict:
    async with runner.lock:
        e = runner.engine
        snap = e.snapshot()
        # A cursor ahead of the server means the engine was reset: send everything.
        reset = any(c is not None and c > s for c, s in ((history_since, e.history.seq), (logs_since, e.logs.seq)))
        snap["history"] = e.history.since(None if reset else history_since, limit=600)
        snap["logs"] = e.logs.since(None if reset else logs_since, limit=300)
        snap["adaptation_events"] = e.events.since(None if reset or events_since is None else events_since, limit=200)
        snap["reset_detected"] = reset
        return snap


def _transition(runner: RunnerDep, allowed: set[str], action: str) -> None:
    e = runner.engine
    if e.state not in allowed:
        raise ConflictError(f"Cannot {action} while the simulation is {e.state}.", code="invalid_state")


@router.post("/start")
async def start(runner: RunnerDep) -> dict:
    async with runner.lock:
        _transition(runner, {"standby"}, "start")
        runner.engine.start()
        return {"state": runner.engine.state}


@router.post("/pause")
async def pause(runner: RunnerDep) -> dict:
    async with runner.lock:
        _transition(runner, {"running"}, "pause")
        runner.engine.pause()
        return {"state": runner.engine.state}


@router.post("/resume")
async def resume(runner: RunnerDep) -> dict:
    async with runner.lock:
        _transition(runner, {"paused"}, "resume")
        runner.engine.resume()
        return {"state": runner.engine.state}


@router.post("/step", summary="Advance exactly one frame (only while paused or in standby)")
async def step(runner: RunnerDep, frames: int = Query(default=1, ge=1, le=500)) -> dict:
    async with runner.lock:
        _transition(runner, {"paused", "standby"}, "step")
        for _ in range(frames):
            runner.engine.step()
        return {"state": runner.engine.state, "frame": runner.engine.frame}


@router.post("/reset")
async def reset(runner: RunnerDep, body: ResetRequest | None = None) -> dict:
    async with runner.lock:
        runner.engine.reset(body.seed if body else None)
        return {"state": runner.engine.state, "seed": runner.engine.seed}


@router.put("/settings")
async def update_settings(runner: RunnerDep, body: SimulationSettingsRequest) -> dict:
    async with runner.lock:
        runner.engine.set_speed(body.speed)
        return {"speed": runner.engine.speed}


@router.get("/history", summary="Per-frame history samples")
async def history(
    runner: RunnerDep,
    since: int | None = Query(default=None, ge=0),
    limit: int = Query(default=600, ge=1, le=20_000),
) -> dict:
    async with runner.lock:
        return {"cursor": runner.engine.history.seq, "items": runner.engine.history.since(since, limit)}


@router.get("/logs", summary="System event log")
async def logs(
    runner: RunnerDep,
    since: int | None = Query(default=None, ge=0),
    limit: int = Query(default=300, ge=1, le=5000),
    category: Literal["simulation", "environment", "adaptation", "transmission", "status", "hardware"] | None = None,
    level: Literal["info", "warning", "error"] | None = None,
) -> dict:
    async with runner.lock:
        items = runner.engine.logs.since(since)
        if category:
            items = [i for i in items if i["category"] == category]
        if level:
            items = [i for i in items if i["level"] == level]
        return {"cursor": runner.engine.logs.seq, "items": items[-limit:]}
