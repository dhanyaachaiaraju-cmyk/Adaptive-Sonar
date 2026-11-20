"""Background task that steps the engine in real time while it is running."""

from __future__ import annotations

import asyncio
import contextlib
import logging

from app.sonar.engine import SimulationEngine

logger = logging.getLogger(__name__)


class SimulationRunner:
    def __init__(self, engine: SimulationEngine, tick_seconds: float):
        self.engine = engine
        self.tick_seconds = tick_seconds
        self.lock = asyncio.Lock()
        self._task: asyncio.Task | None = None

    async def _loop(self) -> None:
        while True:
            await asyncio.sleep(self.tick_seconds)
            async with self.lock:
                if self.engine.state == "running":
                    try:
                        self.engine.step()
                    except Exception:  # noqa: BLE001 - keep the loop alive, surface in the log
                        logger.exception("Simulation frame failed")
                        self.engine.state = "paused"
                        self.engine.log("status", "error", "Simulation frame failed; engine paused. See server log.")

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._loop(), name="sonar-simulation")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
