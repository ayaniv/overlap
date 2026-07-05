# overlap: configurable world-clock, sharing, and meeting scheduler (A–E)

## Context
This is the project currently named **time-spinner** (~/Dev/time-spinner, shipped at commit `c3a19ca`) — a static React+Vite+TS radial world clock. We are **renaming it to `overlap`** and turning it into a portfolio-quality, open-source demo deployed to **Vercel at `overlap.vercel.app`** that signals "Hybrid Product Engineer" ability. A reviewer judges a clean repo + an instantly-loading demo above all.

The work is split into **deployable milestones** so sessions can run in parallel (auto-mode). Cities are currently hardcoded in `App.tsx`; we add five capabilities, backend-free (static, kiosk-friendly): **A** configurable clock, **B** edit locations, **C** share, **D** schedule a meeting, **E** responsive layout.

Locked decisions: colors user-chosen (predefined swatches + free hex + native color picker), stored per location; **work hours per-location**; reorder out; edit/schedule are inline **modes** where the center circle (`glassDisc`) swaps content; entry buttons in a **top-right cluster**; Share is a **copy-link button + toast**; Google Calendar is **client-side** (user-provisioned OAuth Client ID); scheduled meetings drop a **marker dot** on the ring at the meeting time.

**First execution step:** write this plan verbatim to `plan.md` in the repo root and commit it, so every parallel session shares one source of truth.

## Milestones (deployable; dependency-ordered)

Each milestone is independently mergeable + deployable to Vercel. **M0 → M1 are sequential prerequisites; then M2/M3/M4/M5 run in parallel** (separate `git worktree` branches, merged sequentially). Honest constraint: A/config is a hard dependency for B/C/D, so full "everything at once" isn't possible — M1 establishes the shared seams (mode state, ControlCluster shell, center-content slot, meeting-dots pass, `PALETTE`) precisely so M2–M5 stay isolated.

### M0 — Rename + Vercel (blocks all; do first)
Rename dir `~/Dev/time-spinner` → `~/Dev/overlap`; `gh repo rename overlap`; update git remote; `package.json` `name`; `index.html` `<title>`; README + **"live demo" badge** → `https://overlap.vercel.app`. Vite auto-detected by Vercel; hash routing → no rewrites (minimal/optional `vercel.json`). Connect repo as Vercel project `overlap` (user action or `vercel` CLI). Also write `plan.md`.
**Deployable:** current clock live at `overlap.vercel.app`.

### M1 — Config foundation + app scaffolding (blocks M2/M3/M4)
- `src/clock/types.ts`: `Location = {id,label,timezoneId,color,workStart,workEnd}`, `Meeting = {id,startISO,title}`, `ClockConfig = {home, rings, meetings}`.
- `src/clock/shareCodec.ts`: `encode`/`decode` via `lz-string` (config serialization lives here so M3 is just UI).
- `src/hooks/useClockConfig.ts`: resolve **URL hash `#c=` → `localStorage overlap:config:v1` → defaults**; persist + mirror hash on change; expose `config`, `addLocation`, `removeLocation`, `updateLocation`, `setHome`, `addMeeting`.
- `src/App.tsx`: `mode: 'view'|'edit'|'schedule'`; `src/clock/ControlCluster.tsx` shell (top-right Edit/Schedule/Share buttons that set mode / call share handler).
- `src/clock/WorldClock.tsx`: consume `Location[]` (per-loc `color` + work hours); ring radii distributed across band **[160,392]** by count; a **center-content slot** driven by `mode`; a **meeting-dots pass** reading `config.meetings` (empty until M4). `defaultCities.ts` gains `PALETTE`.
**Deployable:** clock renders from persisted config + URL hash; cluster visible (modes fill in later).

### M2 — Edit locations (B) — parallel, needs M1
`src/clock/cityCatalog.ts` (`@vvo/tzdb` → searchable `{label,timezoneId,country}[]`); `src/clock/AddLocationForm.tsx` (+css): typeahead + label + **color: swatches + free hex + native `<input type="color">`** + work hours. Fills the edit-mode center slot ("Add location"/"Cancel"); renders **X**-remove on each ring.
**Deployable:** add/remove/customize cities.

### M3 — Share (C) — parallel, needs M1
`src/clock/Toast.tsx`; Share button copies `location.href` (already carries `#c=`) + "Link copied" toast. Small, isolated (serialization already in M1).
**Deployable:** copy-link sharing; open link in a fresh browser → same clock.

### M4 — Schedule (D) — parallel, needs M1
`src/clock/useRingScrub.ts` (pointer drag rotates rings → `previewOffsetMs` at **15°/hour**; `WorldClock` renders `now = liveNow + offset`; arrow-key a11y); date input; `src/clock/googleCalendar.ts` (GIS script, token flow, scope `calendar.events`, `VITE_GOOGLE_CLIENT_ID`, `signIn`→`createEvent` v3 primary cal, 30min default). Fills schedule-mode slot; success → "V added" 3s → auto-return; failure inline; unset client id → gated note. On success `addMeeting` → **marker dot** on home ring at `angle=(meetingInstant−now)h×15°` (rotates toward NOW).
**Deployable:** schedule meetings (Google-gated) + persistent marker dots.

### M5 — Responsive (E) — parallel, needs only M0
CSS media queries: landscape/desktop = current centered `min(86vmin,700px)`; **portrait/mobile** = clock scaled larger + anchored high so top rings + NOW + center dominate and lower rings bleed off-bottom (per vertical ref; SVG `overflow:visible` → scale-up + downward translate). Top-left context, top-right cluster, bottom status reflow. Touches `WorldClock.module.css` + stage CSS.
**Deployable:** usable on phones (portrait + landscape).

## Parallelization guide
- Order: **M0 → M1**, then **M2 ∥ M3 ∥ M4 ∥ M5**.
- Merge-conflict hotspots: `WorldClock.tsx`, `App.tsx`, `ControlCluster.tsx`, `defaultCities.ts` — M1 defines the seams to minimize this; use one `git worktree` per milestone and merge **M3 → M5 → M2 → M4** (smallest/CSS first, heaviest last).

## User prerequisites
- **Vercel:** connect `ayaniv/overlap` as project `overlap`.
- **Google (M4):** OAuth Client ID (Web), origins `http://localhost:5173` + `https://overlap.vercel.app`, set `VITE_GOOGLE_CLIENT_ID` (D gated until set).
- Deps added: `@vvo/tzdb`, `lz-string`.

## Verification (per milestone; all gate on `npm run build` + `lint` + `test` green)
- **Unit (Vitest):** shareCodec round-trip (M1); cityCatalog SF→`America/Los_Angeles` (M2); geometry radius-band + angle↔offset + meeting-dot angle (M1/M4); config ops (M1).
- **Headless (Playwright, scratchpad scripts):** M2 add "Tokyo" w/ color+hours, persists on reload + X removes; M3 copy link → fresh context renders from `#c=`; M4 drag previews offset, (with client id) event + confirmation + dot appears, (without) gated; M5 screenshots at 1280×800 / 390×844 / landscape.
- **Deploy:** each merged milestone builds on Vercel and loads at `overlap.vercel.app`.
