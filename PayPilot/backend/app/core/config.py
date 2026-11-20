"""Application settings loaded from environment variables / backend/.env.

Only non-secret operational settings are needed: the simulation runs entirely
in memory and requires no database, credentials or connected hardware.
Unknown variables in .env (e.g. left over from earlier projects) are ignored.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Application
    app_name: str = "Adaptive Sonar API"
    app_env: Literal["development", "staging", "production"] = "development"
    log_level: str = "INFO"
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:5173"
    max_request_body_bytes: int = Field(default=100_000, ge=10_000)

    # Simulation
    sim_seed: int = Field(default=1729, ge=0, le=2**31 - 1)
    # Real-time interval between engine frames (seconds). Each frame advances
    # simulated time by `sim_frame_seconds * speed`.
    sim_tick_seconds: float = Field(default=0.5, ge=0.05, le=5.0)
    sim_frame_seconds: float = Field(default=0.5, ge=0.05, le=5.0)
    sim_autostart: bool = False
    # Ring-buffer sizes for history and the event log.
    sim_history_size: int = Field(default=1200, ge=60, le=20_000)
    sim_log_size: int = Field(default=2000, ge=100, le=50_000)

    # Telemetry source. Only "simulation" is implemented; "serial" is reserved
    # for the future STM32F446RE link (see app/sonar/telemetry.py).
    telemetry_source: Literal["simulation", "serial"] = "simulation"
    serial_port: str | None = None
    serial_baud: int = 115200

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
