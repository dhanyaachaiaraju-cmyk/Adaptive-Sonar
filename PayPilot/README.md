# Adaptive Sonar — backend

Simulation backend for **Adaptive Sonar**, an underwater intelligence and transmitter monitoring
dashboard for an adaptive, software-defined sonar transmitter payload for AUVs.

> **All data is simulated.** No hardware is required or accessed. Simulated results are
> not evidence of real-world sonar performance.

| Layer | Stack |
| ----- | ----- |
| Backend (`backend/`) | Python 3.10+, FastAPI, Pydantic Settings — in-memory, no database |
| Dashboard | `../PayPilot-Frontend/` — React 19, Vite, TypeScript, Tailwind v4, Recharts |

`frontend/` in this folder is the **legacy PayPilot JavaScript frontend** and is not used by
Adaptive Sonar. It can be deleted.

## Run

```powershell
cd backend
python -m venv .venv            # first time only
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Then start the dashboard (see `../PayPilot-Frontend/README.md`) and open http://localhost:5173.
API docs (development): http://localhost:8000/api/docs

Optional settings are listed in `backend/.env.example` (seed, tick rate, autostart, buffer sizes).
No secrets are needed. Variables left over from PayPilot in an existing `.env` are ignored and can be removed.

## Quality checks

```powershell
cd backend
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python -m ruff check .
```

## Architecture (`backend/app`)

```
main.py                 App factory: CORS, security headers, error envelope, engine lifecycle
core/                   Settings, logging, error envelope {"error": {code, message, details}}
api/v1/routes/
  simulation.py         start/pause/resume/step/reset, settings, live, history, logs
  environment.py        environment read, auto/manual mode, manual values, scenario
  transmission.py       transmit settings, adaptive/fixed mode, adaptation config & events
  system.py             system status, sonar telemetry, hardware placeholder
  health.py             liveness
sonar/                  Simulation engine (no web code)
  acoustics.py          Mackenzie sound speed, Saunders depth↔pressure, Ainslie–McColm absorption,
                        ambient noise, echo time t = 2R/c
  environment.py        Seeded dive profile + thermocline/halocline (AUTO) or held values (MANUAL)
  targets.py            Primary tracked contact + background contacts
  sonar.py              Sonar equation, detection, echo timing, A-scan, transmit waveform
  adaptation.py         Configurable controller (R1–R6): calibrated sonar-equation prediction + heuristic policy
  telemetry.py          SensorSource interface, simulated CTD, STM32 serial placeholder + frame protocol
  engine.py             Frame loop; each system pings on its own interval; fixed comparators + ablation
  evaluation.py         Seeded multi-seed benchmark incl. oracle fixed setting (grid search with hindsight)
  hardware.py           Transmitter/receiver ports + STM32F446RE feasibility check (approximate figures)
  dsp.py                Reference DSP for firmware: pulse -> DAC codes, I/Q envelope, time of flight
  history.py            Sequence-numbered ring buffers for incremental polling
  runner.py             Background asyncio task stepping the engine in real time
```

### Key endpoints (`/api/v1`)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/simulation/live?history_since=&logs_since=&events_since=` | Snapshot + new history/log/event entries (dashboard polls this) |
| GET | `/simulation/state` | Full snapshot |
| POST | `/simulation/start` · `/pause` · `/resume` · `/step?frames=n` · `/reset {seed}` | Lifecycle |
| PUT | `/simulation/settings {speed}` | Simulation speed |
| GET / PUT | `/environment` · `/environment/mode` · `/environment/manual` · `/environment/scenario` | Environment |
| GET / PUT | `/transmission` · `/transmission/mode` | Transmit settings, adaptive vs fixed |
| GET / PUT / POST | `/adaptation/config` · `/adaptation/config/reset` · `/adaptation/events` | Algorithm |
| GET | `/simulation/history` · `/simulation/logs` | Historical readings, event log |
| GET | `/system/status` · `/telemetry/sonar` · `/hardware/status` | Status, sonar telemetry, hardware placeholder + feasibility |
| POST / GET | `/analysis/benchmark` · `/analysis/scenarios` · `/analysis/comparison` | Reproducible benchmark (fresh engines), live comparison window |

### Fair comparison

Every system (adaptive, Fixed A, Fixed A + measured c, Fixed B) sees the same environment, targets and
shared echo-fluctuation process, pings at its own interval, and has a private jitter stream. Statistics
use the same simulated time window for all. For conclusions use `POST /analysis/benchmark`: scripted
scenarios, several seeds, mean ± 95 % t-interval across seeds, and the best of 54 fixed settings chosen
with hindsight. All figures are simulated.

### Determinism

Every random process uses a `random.Random` stream derived from `SIM_SEED`. The same seed and the
same sequence of operator inputs reproduce the same run (covered by `tests/test_engine.py`).

### Future hardware

The engine reads environmental *measurements* through `SensorSource.read()`. To use the
STM32F446RE, implement `SerialTelemetrySource` in `sonar/telemetry.py` (the ASCII frame format and
its parser are already defined and tested), then select it in the engine when
`TELEMETRY_SOURCE=serial`. The API and dashboard do not change.
