# overlap

[![Live demo](https://img.shields.io/badge/live%20demo-overlap--clock.vercel.app-4c9a6b)](https://overlap-clock.vercel.app)

A radial multi-timezone "meeting planner" clock. Five cities are drawn as concentric
rings around a central local time; each ring shows a colored arc for that city's working
hours with a dot at its current moment. A shared **NOW** axis points straight up, so
overlapping arcs near the top mean everyone is currently in working hours — answering
_"When can everyone meet today?"_ at a glance.

Built from a Claude Design reference (`World Clock v4`) — React + Vite + TypeScript,
all graphics rendered as SVG from `Intl.DateTimeFormat`, no timezone/date libraries.

## Features

- Concentric per-city rings with working-hours arcs (soft glow + crisp pass)
- Live now-dots (white with a pulsing halo when the city is in working hours, dimmed otherwise)
- NOW strike line, graduated bezel, and a needle that sweeps one revolution per minute
- Direction chevrons emphasizing the clockwise sweep
- Central glass disc with the local city's time and date
- DST-correct via IANA timezone ids; respects `prefers-reduced-motion`

## Development

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # typecheck + production build
npm test         # geometry + timezone unit tests (Vitest)
npm run lint     # oxlint
```

## Structure

- `src/clock/geometry.ts` — ring/arc/tick/chevron math on a 1000×1000 viewBox
- `src/clock/cityTime.ts` — timezone-aware time + working-hours helpers
- `src/clock/WorldClock.tsx` — the radial clock component (props-driven; `now` supplied by the parent)
- `src/clock/defaultCities.ts` — default home + world cities and working hours
- `src/hooks/useNow.ts` — shared 1s tick
