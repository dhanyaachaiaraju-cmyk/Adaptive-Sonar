from typing import Annotated

from fastapi import Depends, Request

from app.core.config import Settings, get_settings
from app.sonar.runner import SimulationRunner

SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_runner(request: Request) -> SimulationRunner:
    return request.app.state.runner


RunnerDep = Annotated[SimulationRunner, Depends(get_runner)]
