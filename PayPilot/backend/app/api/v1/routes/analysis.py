"""Reproducible offline evaluation (does not touch the live simulation)."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import RunnerDep
from app.sonar.evaluation import SCENARIOS, run_benchmark

router = APIRouter(prefix="/analysis", tags=["analysis"])


class BenchmarkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario: Literal["range_sweep", "fixed_range_dive", "far_contact"] = "range_sweep"
    seeds: int = Field(default=5, ge=1, le=10)
    base_seed: int = Field(default=1000, ge=0, le=2**31 - 100)
    duration_s: float = Field(default=600.0, ge=60, le=1200)
    include_grid: bool = True


@router.get("/scenarios")
async def scenarios() -> dict:
    return {"scenarios": SCENARIOS}


@router.post("/benchmark", summary="Run a seeded, scripted adaptive-vs-fixed benchmark (simulated)")
def benchmark(body: BenchmarkRequest) -> dict:
    # Plain `def`: FastAPI runs it in a worker thread, so the live simulation keeps ticking.
    return run_benchmark(
        scenario=body.scenario,
        seeds=body.seeds,
        base_seed=body.base_seed,
        duration_s=body.duration_s,
        include_grid=body.include_grid,
    )


@router.get("/comparison", summary="Live comparison window (sliding, depends on operator inputs)")
async def comparison(runner: RunnerDep) -> dict:
    async with runner.lock:
        return runner.engine.comparison_view()
