from fastapi import APIRouter

from app.api.v1.routes import analysis, environment, health, simulation, system, transmission

api_router = APIRouter(prefix="/v1")
api_router.include_router(health.router)
api_router.include_router(simulation.router)
api_router.include_router(environment.router)
api_router.include_router(transmission.router)
api_router.include_router(system.router)
api_router.include_router(analysis.router)
