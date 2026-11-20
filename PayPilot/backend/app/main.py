from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.sonar.engine import SimulationEngine
from app.sonar.runner import SimulationRunner


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = SimulationEngine(
            seed=settings.sim_seed,
            frame_seconds=settings.sim_frame_seconds,
            history_size=settings.sim_history_size,
            log_size=settings.sim_log_size,
        )
        if settings.sim_autostart:
            engine.start()
        runner = SimulationRunner(engine, settings.sim_tick_seconds)
        app.state.runner = runner
        runner.start()
        yield
        await runner.stop()

    docs_enabled = not settings.is_production
    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        description="Simulation backend for the Adaptive Sonar dashboard. All data is simulated.",
        lifespan=lifespan,
        docs_url=f"{settings.api_prefix}/docs" if docs_enabled else None,
        redoc_url=None,
        openapi_url=f"{settings.api_prefix}/openapi.json" if docs_enabled else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.middleware("http")
    async def limit_body_size(request: Request, call_next):
        length = request.headers.get("content-length")
        if length is not None:
            if not length.isdigit():
                return JSONResponse(
                    {"error": {"code": "bad_request", "message": "Invalid Content-Length.", "details": None}},
                    status_code=400,
                )
            if int(length) > settings.max_request_body_bytes:
                return JSONResponse(
                    {"error": {"code": "payload_too_large", "message": "Request is too large.", "details": None}},
                    status_code=413,
                )
        return await call_next(request)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        if request.url.path.startswith(settings.api_prefix):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    register_exception_handlers(app)
    app.include_router(api_router, prefix=settings.api_prefix)
    return app


app = create_app()
