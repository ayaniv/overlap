# overlap — Milestone Build (M2)

## Workspace (code tasks only)
- Repo: overlap
- Branch: claude/overlap-m2
- Branch status: new (branched from claude/overlap-m1, which contains M0 + M1)

## Mode: implement
Implement **M2 only** from the plan, then STOP and set STATUS to `waiting` for the user's go-ahead before starting M3. Do not skip ahead. Do not run past the M2 boundary without an explicit go-ahead.

## Context
- Source of truth: `~/Dev/overlap/prompt.md` — read it in full first.
- Milestone plan: `~/Dev/overlap/plan.md` — read it. Milestones are labeled M0, M1, M2, …
- **M0 and M1 are already DONE.** Your branch `claude/overlap-m2` is cut from `claude/overlap-m1`, so M0 (repo rename + Vercel config) and M1 (config foundation + app scaffolding, commit `da1e320`) are already present. Do NOT redo them.
- Run `npm install` in the worktree before building/running (fresh worktree has no node_modules).

## Steps
1. Read `~/Dev/overlap/prompt.md` and `~/Dev/overlap/plan.md` fully.
2. Identify exactly what **M2** requires (per the plan).
3. Implement M2 in the worktree, following the repo's existing conventions established in M0/M1.
4. Verify (build / lint / tests as applicable) and capture the evidence.
5. Write a short M2 summary into this TASK.md under `## M2 Result`, set STATUS to `waiting`, and stop for the user's go-ahead.

## Engineering Constraints (required)
- **Test coverage:** cover all new functionality with tests for both happy and failure paths, using the repo's existing test framework (Vitest).
- **Error observability:** any fallible operation must handle and log errors so failures are observable.
- **Conventions:** follow the target repo's existing patterns (styling, state, testing, config) rather than introducing new ones.

## Output
Write the M2 summary + verification evidence into this TASK.md under `## M2 Result`. Then STATUS = `waiting`.

## Session continuity (required)
When this session grows long, proactively suggest `/handover` to the user before context degrades.

## Status reporting (required)
When you need input (including between milestones): `echo "waiting: <reason>" > STATUS`
When done: `echo "done" > STATUS`
(The orchestrator already wrote `working` to STATUS before opening this tab — do not overwrite it until your state actually changes.)

## M2 Result

Implemented M2 — Edit locations (B) on top of M1's config foundation, on branch `claude/overlap-m2` (worktree `~/Dev/worktrees/overlap-m2`).

**What shipped:**
- `src/clock/cityCatalog.ts` — flattens `@vvo/tzdb`'s `getTimeZones()` main-cities into a single searchable `CityEntry[]` (`{label, timezoneId, country}`); `searchCities(query, limit)` ranks prefix matches ahead of mid-word matches, returns `[]` for blank/no-match queries.
- `src/clock/locationForm.ts` — pure, fully-tested form logic kept separate from the component (matches the repo's `configOps.ts`/`useClockConfig.ts` split): `isValidHexColor`, `buildLocationId` (slugify + disambiguate against existing ids), `validateNewLocation` (city/label/color/work-hours checks), `buildNewLocation` (throws on misuse if called without a validated city).
- `src/clock/AddLocationForm.tsx` (+ `.module.css`) — fills the edit-mode center slot: typeahead city search that becomes an editable label once a city is picked (kept as one field to fit the small center disc), color via 8 palette swatches + free hex input + native `<input type="color">`, per-location work-hours (start/end), inline validation error, Cancel/Add actions. Deliberately compact (~196px wide, ~180px tall) since the center slot is only ~30% of the clock's width — verified visually with Playwright that it no longer overflows into the ring labels the way an earlier, roomier draft did.
- `src/clock/WorldClock.tsx` (+ `.module.css`) — renders an "×" remove button on each non-home ring when `mode === 'edit'` (home isn't removable — it's a singular field, not part of `rings`); new `onRemoveLocation` prop.
- `src/App.tsx` — wires `addLocation`/`removeLocation` from `useClockConfig` into the new `AddLocationForm` (as `centerContent` during edit mode) and `WorldClock`'s `onRemoveLocation`.
- Added `@vvo/tzdb` as a real dependency (was already anticipated by M1/plan).

**Tests (Vitest, happy + failure paths):**
- `cityCatalog.test.ts` — SF → `America/Los_Angeles` (per the plan's own verification spec), case-insensitivity, prefix ranking, blank/no-match/limit edge cases.
- `locationForm.test.ts` — hex validation (valid/malformed), id slugify + collision disambiguation + all-symbol fallback, full validation matrix (missing city, empty label, bad color, out-of-range/inverted work hours), `buildNewLocation` happy path + throw-on-misuse.
- No new tests added for `AddLocationForm`/`WorldClock` component rendering — the repo has no jsdom/testing-library installed and all existing tests (including `useClockConfig.test.ts`) test the exported pure logic rather than rendering components, so I followed that convention and put all new logic that could fail into the two pure modules above, which are fully covered.

**Verification evidence:**
- `npm run build` (`tsc -b && vite build`) — clean, no type errors.
- `npm run lint` (`oxlint`) — clean, exit 0.
- `npm test` (`vitest run`) — 7 test files, 59 tests, all passing (up from 5 files pre-M2).
- Manual end-to-end pass via a throwaway Playwright script against `npm run dev`: entered edit mode, searched "Tokyo", picked it, submitted with defaults → appeared on the ring; reloaded the page → persisted (localStorage + hash); re-entered edit mode, clicked the new "×" button → removed; typed an invalid hex color and submitted → inline validation error shown, no location added. Also screenshotted view mode to confirm no regression to the M1 clock/center display.

**Not in scope (left for later milestones per the plan):** Share (M3), Schedule/Google Calendar (M4), responsive layout (M5).

STATUS: `waiting` — ready for go-ahead to start M3.
