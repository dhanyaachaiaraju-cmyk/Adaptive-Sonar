from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.sonar.environment import LIMITS


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _rng(key: str):
    lo, hi = LIMITS[key]
    return Field(default=None, ge=lo, le=hi)


class ResetRequest(_Strict):
    seed: int | None = Field(default=None, ge=0, le=2**31 - 1)


class SimulationSettingsRequest(_Strict):
    speed: float = Field(ge=0.25, le=8)


class EnvironmentModeRequest(_Strict):
    mode: Literal["auto", "manual"]


class ManualEnvironmentRequest(_Strict):
    temperature_c: float | None = _rng("temperature_c")
    depth_m: float | None = _rng("depth_m")
    pressure_dbar: float | None = _rng("pressure_dbar")
    salinity_psu: float | None = _rng("salinity_psu")
    wind_speed_m_s: float | None = Field(default=None, ge=0, le=30)

    @model_validator(mode="after")
    def _not_empty(self):
        if all(v is None for v in self.model_dump().values()):
            raise ValueError("Provide at least one environmental parameter")
        return self


class ScenarioRequest(_Strict):
    primary_range_mode: Literal["auto", "manual"]
    primary_range_m: float | None = Field(default=None, ge=30, le=1400)

    @model_validator(mode="after")
    def _range_required(self):
        if self.primary_range_mode == "manual" and self.primary_range_m is None:
            raise ValueError("primary_range_m is required in manual mode")
        return self


class TransmissionModeRequest(_Strict):
    mode: Literal["adaptive", "fixed"]
