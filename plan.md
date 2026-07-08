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

### M7 — Scrub keyboard granularity; ControlCluster collapse/expand (builds on M4, needs M4)

**Scrub keyboard granularity — minutes vs. hours**
Raised during M4's `/t2a-review`: `useRingScrub.ts`'s `onKeyDown` currently treats all four arrow keys identically (`ArrowRight`/`ArrowUp` = +1h, `ArrowLeft`/`ArrowDown` = -1h, via a single `ARROW_STEP_MS = MS_PER_HOUR`), so there's no fine-grained keyboard way to land on a specific minute — only mouse/touch drag can. Decision (explicitly preferred over a Shift+Arrow fine/coarse split, which was also discussed): split by axis instead — **Left/Right step minutes, Up/Down step hours** — giving keyboard-only users both granularities without a modifier key.
- `useRingScrub.ts`: replace the single `ARROW_STEP_MS` branch with two step sizes (e.g. `ARROW_MINUTE_STEP_MS` for Left/Right, `MS_PER_HOUR` for Up/Down); `ArrowRight`/`ArrowUp` still increase, `ArrowLeft`/`ArrowDown` still decrease.
- Note for implementation: this diverges from the ARIA APG slider convention (where all four arrow keys conventionally step by the same amount) — `WorldClock.tsx`'s `aria-valuetext` on the scrub slider should be reviewed so a screen-reader user isn't surprised that Up/Down and Left/Right move by different amounts; the existing gap where `aria-valuenow` isn't clamped to `aria-valuemin`/`aria-valuemax` (flagged in the same `/t2a-review` pass) should be fixed in the same milestone since both touch the slider's ARIA contract.
- Update `useRingScrub.test.ts`'s existing "steps by exactly one hour per ArrowRight/ArrowLeft press" test, which will no longer be accurate once Left/Right step minutes instead.
**Deployable:** scrubbing via keyboard alone can reach any minute, not just whole hours.

**ControlCluster collapse/expand**
`ControlCluster.tsx` currently always shows all three buttons (Edit, Schedule, Share) side by side. Collapse it behind a single circular toggle button showing a hamburger icon (two horizontal lines) at rest.
- Clicking the toggle: the toggle button itself translates left by 300px, and the three cluster buttons fade + scale in (opacity 0→1, scale 0.9→1) into the space it vacated.
- While expanded, the toggle's icon morphs from the two-line hamburger to an X; clicking it again (from its translated position) reverses both animations — the cluster buttons fade + scale back out, the toggle slides back to its original position, and the icon reverts to the hamburger.
- Likely touches `ControlCluster.tsx` (collapsed/expanded state + icon swap) and `ControlCluster.module.css` (the transform/opacity/scale transitions).
**Deployable:** ControlCluster starts collapsed as a single round icon button; expands/collapses with a smooth transition instead of always showing all three buttons.

**Scrubbing onto an existing meeting surfaces it in the Schedule panel, with delete**
Scrubbing (or landing via keyboard) on a time that already has a meeting should show that meeting's details as a banner in `ScheduleForm.tsx`, underneath the Cancel/Schedule buttons — and let the user clear it, from both the clock and Google Calendar.
- New helper (e.g. `findMeetingAtInstant(meetings, instant, toleranceMs)` in `meetingForm.ts`) matching `previewInstant` against `config.meetings` by actual time proximity (a tolerance window, not exact equality) — computed in `App.tsx` alongside `previewInstant`, passed to `ScheduleForm` as a new `matchedMeeting?: Meeting` prop.
- **Prerequisite gap, not just UI:** `Meeting` (`types.ts`) only stores `{id, startISO, title}` — no Google Calendar event id — and `createCalendarEvent` (`googleCalendar.ts`) discards the API response entirely (`Promise<void>`), so there's currently no way to identify which Google event to delete. Needs: `Meeting` gains an optional `googleEventId?: string`; `createCalendarEvent`/`scheduleMeetingOnGoogleCalendar` return the created event's id (from the v3 response body) so `buildMeeting` can store it.
- New `deleteCalendarEvent(accessToken, eventId)` in `googleCalendar.ts` (`DELETE .../calendars/primary/events/{eventId}`), and a `removeMeetingOp(config, id)` in `configOps.ts` mirroring `removeLocationOp`, wired through `useClockConfig.ts`.
- The banner's delete action needs its own sign-in (same GIS token flow as scheduling — deleting also requires OAuth) before calling `deleteCalendarEvent`, then `removeMeetingOp` on success; a meeting with no `googleEventId` (e.g. one from before this migration, or a share-link config from someone else) should still be removable locally, just skip the Google Calendar call and say so.
**Deployable:** scrubbing onto a scheduled meeting shows its details in the schedule panel and lets you delete it from both the clock and Google Calendar.

**Status/footer copy fixes**
Two small copy issues in `WorldClock.tsx`'s footer row:
- `statusText` (line ~203) reads `"{availableCount} of {totalCount} teams free now"` — change to **"{availableCount} of {totalCount} teams are available now"**.
- The `legend` div (line ~427) reads `"Home working hours {workLabel} · local"`, implying a single shared working-hours policy — but work hours are per-location (each ring, set in M2's `AddLocationForm`), not global, so this footer is misleading as written. Needs a rework, not just a wording tweak: either drop it, or replace it with something that doesn't imply one shared schedule (e.g. only shown when relevant to what's actually being displayed, or dropped in favor of the per-ring working-hours arcs already visible on the dial itself, which already correctly show each location's own hours).
**Deployable:** accurate footer copy that doesn't imply a single global working-hours policy.