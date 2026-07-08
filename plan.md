# overlap: configurable world-clock, sharing, and meeting scheduler (A–E)

## Context
This is the project currently named **time-spinner** (~/Dev/time-spinner, shipped at commit `c3a19ca`) — a static React+Vite+TS radial world clock. We are **renaming it to `overlap`** and turning it into a portfolio-quality, open-source demo deployed to **Vercel at `overlap.vercel.app`** that signals "Hybrid Product Engineer" ability. A reviewer judges a clean repo + an instantly-loading demo above all.

The work is split into **deployable milestones** so sessions can run in parallel (auto-mode). Cities are currently hardcoded in `App.tsx`; we add five capabilities, backend-free (static, kiosk-friendly): **A** configurable clock, **B** edit locations, **C** share, **D** schedule a meeting, **E** responsive layout.

Locked decisions: colors user-chosen (predefined swatches + free hex + native color picker), stored per location; **work hours per-location**; reorder out (revisited in M6 — reorder returns, scoped to the config-panel list only); edit/schedule are inline **modes** where the center circle (`glassDisc`) swaps content; entry buttons in a **top-right cluster**; Share is a **copy-link button + toast**; Google Calendar is **client-side** (user-provisioned OAuth Client ID); scheduled meetings drop a **marker dot** on the ring at the meeting time.

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

### M4 addendum — scrub UX overhaul, connection gating, dot correctness
Landed on `claude/overlap-m4` well beyond the paragraph above, via live user feedback across the build session (still inside the M4 boundary — no M5 work started):
- Schedule form gated behind having scrubbed the rings at least once this visit (`<fieldset disabled>` + tooltip) — forces a deliberate time pick instead of silently defaulting to "now".
- "When" changed from `datetime-local` to **date-only** (`type="date"`, `showPicker()` on click); time-of-day is set exclusively by scrubbing and shown as a read-only readout next to the date field.
- Scrubbing decoupled from schedule mode: drag/arrow-keys work in `'view'` mode too, and starting a scrub **auto-opens** the schedule panel — the gesture itself is the entry point into scheduling, not a prerequisite for it.
- Added a **duration picker** (15/30/45/60min pills, `ScheduleForm.tsx`), replacing the fixed 30min default; threaded through `createCalendarEvent`/`scheduleMeetingOnGoogleCalendar`.
- `meetingAngle()` had an inverted sign vs. every other angle on the dial (`workingHoursArcPath`, chevrons); fixed so future meetings sweep clockwise toward NOW like the rest of the dial, matching the "rotates toward NOW" behavior specced above.
- Meeting dots now read `effectiveNow` (the live scrub-preview instant), not real `now` — so a dot stays visually attached to the ring and sweeps as you scrub, instead of freezing on screen while the ring rotates under it.
- Meeting dots are only drawn on their actual calendar date (home timezone, via a new `getCityDateKey` in `cityTime.ts`) — the angle alone repeats every 24h, so a meeting a day away used to render on top of today's hour.
- Meeting dots are gated behind a new runtime `isGoogleCalendarConnected()` flag (`overlap:google-connected:v1` in localStorage, set on a successful OAuth sign-in) — distinct from the build-time `isGoogleCalendarConfigured()` check. `meetings` rides along in the shareable config (URL hash), so without this a share-link viewer who'd never signed in themselves could see the owner's scheduled meetings.
- `useRingScrub.ts`: fixed a wraparound bug where a continuous multi-turn drag (moving a finger all the way around the ring, not just back-and-forth on one side) snapped the offset backward — `angleDelta` only returns `(-180°,180°]`, and the hook was measuring every move against the drag's fixed *start* angle instead of the previous sample. Also caches `getBoundingClientRect()` once on `pointerdown` instead of every `pointermove`.
- `role="slider"` on the clock face now sets `aria-valuemin`/`aria-valuemax`/`aria-valuetext` alongside `aria-valuenow` (was previously incomplete for assistive tech).
- Schedule button is icon-only (calendar SVG), matching the icon-only Share button from the same-day M3 rewrite it merged in.
**Deployable:** merged into `claude/overlap-m4`; PR #4 (base `main`) open.

### Addendum (pre-M5) — Clock marker & dial polish
Unplanned, landed on `claude/overlap-clock-marker` (PR #5) ahead of M5, touching the same `WorldClock.tsx`/`geometry.ts` files M5 will also touch (see merge-conflict hotspots below) — M5 should rebase onto this first.
- Removed the NOW crossing-line + pill capsule; replaced with a filled **equilateral triangle** marker fixed at 12 o'clock (`topMarkerPoints()` in `geometry.ts`), replacing bezel tick #0.
- Added a subtle fading guide line (SVG `linearGradient`) from the triangle's apex down to the dial center, rendered behind the per-ring dots.
- Fixed inconsistent per-ring label/dot gap — `startOffset` was a percentage of each ring's arc length (which scales with radius, so inner rings looked cramped); switched to a fixed absolute-pixel gap via `labelArcHalfLength()`. This closes note 1 from the pre-M5 review below ("Add more gap between dot name and time").
- Memoized `ControlCluster` (doesn't depend on the once-a-second `now` tick).
**Deployable:** merged as PR #5.

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


Notice: Please notice some things I've noticed:
1. Add more gap between dot name and time.
2. rings should be from center and can grow gradually
3. the ticks radial can grow/shrink accordingly
4. the chevrons should only be visible in between rings.
5. Im going away from updating the center component according to Edit / Share / Schedule. Instead let's add a modal next to the button on the top right.

### M6 — Config panel: cogwheel entry, reorder, set-home (builds on M2, needs M1/M2)
Reworks the M2 "Edit" entry point into a proper config panel, and — as a side effect — finally gives the user a way to change HOME (today `home` is a fixed `ClockConfig` field seeded from `DEFAULT_HOME_CITY`; `setHome`/`setHomeOp` exist in `useClockConfig.ts`/`configOps.ts` but are unwired to any UI).
- `ControlCluster.tsx`: swap the "Edit" text button for a **cogwheel icon** button (same click → opens the config modal per the M2 notice above; mode/aria label becomes "Config").
- The modal has two stacked sections:
  a. **Add location** — existing `AddLocationForm`, unchanged.
  b. **Manage locations** — new list below it, one row per location currently on the clock (home + all rings), **ordered inside → outside**. Each row gets a reorder control (drag or up/down) plus the existing X-remove (home's row has no remove, only reorder).
  c. The row in the **first/innermost slot** always shows a **home icon** next to its color dot — whichever location is dragged into that slot becomes HOME.
- Data layer: new `reorderLocationsOp(config, orderedIds)` in `configOps.ts` — takes the full home+rings id order, and if the first id changed, swaps `home` (reusing `setHomeOp`) while sliding the previous home into `rings` at the vacated spot; otherwise just reorders `rings`. `useClockConfig.ts` exposes it (finally wiring `setHome`); `App.tsx` threads it through `WorldClockProps` (new `onReorder`) to the manage-locations list.
**Deployable:** cogwheel opens a panel with add-location + a reorderable/removable list of every current location; dragging a city into the top slot makes it HOME.