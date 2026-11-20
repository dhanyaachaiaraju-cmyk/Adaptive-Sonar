import os

# Tests never depend on a developer's backend/.env values.
os.environ["APP_ENV"] = "development"
os.environ["SIM_AUTOSTART"] = "false"
os.environ["SIM_SEED"] = "1729"
os.environ["SIM_TICK_SECONDS"] = "5"  # background loop effectively idle; tests drive frames via /step
os.environ["TELEMETRY_SOURCE"] = "simulation"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import get_settings  # noqa: E402


@pytest.fixture
def client():
    get_settings.cache_clear()
    from app.main import create_app

    with TestClient(create_app()) as c:
        yield c
    get_settings.cache_clear()
