"""Transmit settings, adaptation configuration and adaptation events."""

from fastapi import APIRouter, Query

from app.api.deps import RunnerDep
from app.api.schemas import TransmissionModeRequest
from app.sonar.adaptation import AdaptationConfig

router = APIRouter(tags=["transmission"])


@router.get("/transmission")
async def get_transmission(runner: RunnerDep) -> dict:
    async with runner.lock:
        snap = runner.engine.snapshot()
        return {**snap["transmission"], "baseline": snap["baseline"], "performance": snap["performance"]}


@router.put("/transmission/mode", summary="Adaptive transmission or fixed baseline settings")
async def set_mode(runner: RunnerDep, body: TransmissionModeRequest) -> dict:
    async with runner.lock:
        cfg = runner.engine.adaptation_config.model_copy(update={"enabled": body.mode == "adaptive"})
        runner.engine.set_adaptation_config(cfg)
        return runner.engine.transmission_view()


@router.get("/adaptation/config", response_model=AdaptationConfig)
async def get_config(runner: RunnerDep) -> AdaptationConfig:
    return runner.engine.adaptation_config


@router.put("/adaptation/config", response_model=AdaptationConfig)
async def put_config(runner: RunnerDep, body: AdaptationConfig) -> AdaptationConfig:
    async with runner.lock:
        runner.engine.set_adaptation_config(body)
        return runner.engine.adaptation_config


@router.post("/adaptation/config/reset", response_model=AdaptationConfig)
async def reset_config(runner: RunnerDep) -> AdaptationConfig:
    async with runner.lock:
        enabled = runner.engine.adaptation_config.enabled
        runner.engine.set_adaptation_config(AdaptationConfig(enabled=enabled))
        return runner.engine.adaptation_config


@router.get("/adaptation/events")
async def events(
    runner: RunnerDep,
    since: int | None = Query(default=None, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
) -> dict:
    async with runner.lock:
        return {"cursor": runner.engine.events.seq, "items": runner.engine.events.since(since, limit)}
