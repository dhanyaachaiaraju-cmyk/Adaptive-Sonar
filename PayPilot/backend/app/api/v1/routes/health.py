from fastapi import APIRouter, Request

from app import __version__
from app.api.deps import SettingsDep
from app.schemas import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=HealthResponse, summary="Liveness probe")
async def liveness(settings: SettingsDep, request: Request) -> HealthResponse:
    runner = getattr(request.app.state, "runner", None)
    return HealthResponse(
        status="ok",
        version=__version__,
        environment=settings.app_env,
        checks={"simulation_engine": "ok" if runner else "not_started", "hardware": "not_connected"},
    )
