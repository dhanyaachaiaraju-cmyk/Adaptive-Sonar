"""Environmental parameters: read, manual control, auto/manual mode and scenario."""

from fastapi import APIRouter

from app.api.deps import RunnerDep
from app.api.schemas import EnvironmentModeRequest, ManualEnvironmentRequest, ScenarioRequest
from app.sonar.environment import LIMITS

router = APIRouter(prefix="/environment", tags=["environment"])


@router.get("")
async def get_environment(runner: RunnerDep) -> dict:
    async with runner.lock:
        return {**runner.engine.snapshot()["environment"], "limits": LIMITS}


@router.put("/mode")
async def set_mode(runner: RunnerDep, body: EnvironmentModeRequest) -> dict:
    async with runner.lock:
        runner.engine.set_environment_mode(body.mode)
        return runner.engine.snapshot()["environment"]


@router.put("/manual", summary="Set manual values (switches to manual mode). Depth and pressure stay consistent.")
async def set_manual(runner: RunnerDep, body: ManualEnvironmentRequest) -> dict:
    async with runner.lock:
        runner.engine.set_manual_environment(body.model_dump(exclude_none=True))
        return runner.engine.snapshot()["environment"]


@router.put("/scenario", summary="Primary contact range: automatic motion or operator-set range")
async def set_scenario(runner: RunnerDep, body: ScenarioRequest) -> dict:
    async with runner.lock:
        runner.engine.set_primary_range(body.primary_range_mode, body.primary_range_m)
        return runner.engine.snapshot()["primary"]
