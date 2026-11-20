# Adaptive Sonar — dashboard

Underwater intelligence and transmitter monitoring console for an adaptive sonar transmitter.
Every value is produced by the backend simulation engine (`../PayPilot/backend`); the dashboard
only presents it.

## Stack

React 19 · Vite · TypeScript · Tailwind CSS v4 · Recharts · Lucide React

## Run

```powershell
# 1. backend (separate terminal) — see ../PayPilot/README.md
cd ..\PayPilot\backend; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8000

# 2. dashboard
npm.cmd install
npm.cmd run dev        # http://localhost:5173  (/api is proxied to the backend)
```

If the backend runs on another port: `$env:SONAR_API_URL='http://localhost:8001'; npm.cmd run dev`.

```powershell
npm.cmd run lint
npm.cmd run build      # type-check + production build to dist/
```

## Demo script

1. **Start** in the header. The vehicle dives through an assumed thermocline.
2. **Overview** shows sound speed falling with temperature. The *adaptive transmission cycle* shows each stage.
3. **Environment Simulator** → move *Primary contact range* to ~1300 m. The transmitter steps the frequency
   down, lengthens the pulse, switches CW → LFM and widens the interval.
4. **Adaptive Transmission** lists every change with its trigger and reason. Switch to **Fixed** to compare.
5. **Analytics** → *Signal-to-noise ratio* compares adaptive and fixed settings on the same simulated echoes.

## Structure

```
src/
  app/routes.ts, router.ts   Sections and a tiny hash router (/#/sonar)
  lib/api.ts                 Backend client + error envelope handling
  features/sim/              Types, API calls, live polling store, action hook
  components/
    layout/                  App shell, sidebar, header
    sim/                     Simulation controls, status pills, adaptation cycle, loading/offline gate
    sonar/                   PPI scan display (canvas), A-scan, waveform, signal meter
    charts/                  Live time-series chart
    ui/                      Card/Panel, Button, Badge, SegmentedControl, Readout, ParamSlider, toasts
  pages/                     Overview, Environment, Transmission, Sonar, Analytics, Logs, Hardware, About
```

The design tokens live in `src/index.css` (`--as-*`). Chart colours `--as-chart-1` / `--as-chart-2` were
checked for colour-vision-deficiency separation on the panel surface.
