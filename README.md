# overlap

[![Live demo](https://img.shields.io/badge/live%20demo-overlapclock.com-4c9a6b)](https://overlapclock.com)

A free, open-source, backend-free world clock for scheduling across timezones.
Add any cities as configurable concentric rings around your local time; each ring
shows a colored arc for that location's working hours with a dot at its current
moment, so overlapping arcs mean everyone is currently available — answering
_"See shared hours instantly"_ at a glance. Share the exact view via a link (no
signup, no account), or schedule a meeting straight to Google Calendar.

Built from a Claude Design reference (`World Clock v4`) — React + Vite + TypeScript,
all graphics rendered as SVG from `Intl.DateTimeFormat`, no timezone/date libraries.

![overlap screenshot](docs/screenshot.png)

## Features

- Fully configurable locations: add or remove any city, reorder rings, set which
  city is "home", and customize each location's color and working hours
- Concentric per-city rings with working-hours arcs (soft glow + crisp pass)
- Live now-dots (white with a pulsing halo when the city is in working hours, dimmed otherwise)
- Share button copies a link that reproduces your exact configuration for anyone
  who opens it — the whole config lives in the URL hash, no account or database
- Schedule a meeting: drag the clock face (or use arrow keys) to preview a different
  time across every ring, then create the event on your Google Calendar
- Graduated bezel, a NOW marker fixed at 12 o'clock, and a needle that sweeps one
  revolution per minute
- Direction chevrons emphasizing the clockwise sweep
- Central glass disc with the local city's time and date
- DST-correct via IANA timezone ids; respects `prefers-reduced-motion`
- Responsive layout for desktop and mobile (portrait and landscape)

## Development

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # typecheck + production build
npm test         # geometry + timezone unit tests (Vitest)
npm run lint     # oxlint
```

### Environment variables

Scheduling meetings is gated behind a Google OAuth Client ID (client-side only, no
backend). Copy `.env.example` to `.env.local` and fill in `VITE_GOOGLE_CLIENT_ID` to
enable it; without it, the Schedule panel shows a note instead of the form.

## Structure

- `src/clock/geometry.ts` — ring/arc/tick/chevron math on a 1000×1000 viewBox
- `src/clock/cityTime.ts` — timezone-aware time + working-hours helpers
- `src/clock/WorldClock.tsx` — the radial clock component (props-driven; `now` supplied by the parent)
- `src/clock/defaultCities.ts` — default home + world cities and working hours
- `src/hooks/useNow.ts` — shared 1s tick

## License

Released under the [MIT License](./LICENSE).

## Privacy

See the [privacy policy](https://overlapclock.com/privacy.html) for what
data the app collects (none, server-side) and how the Google Calendar scope is used.
