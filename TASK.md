# overlap — Milestone Build (M4)

## Workspace (code tasks only)
- Repo: overlap
- Branch: claude/overlap-m4
- Branch status: new (branched from claude/overlap-m3, which contains M0–M3)

## Mode: implement
Implement **M4 only** from the plan, then STOP and set STATUS to `waiting` for the user's go-ahead before starting M5. Do not skip ahead. Do not run past the M4 boundary without an explicit go-ahead.

## Context
- Source of truth: `~/Dev/overlap/prompt.md` — read it in full first.
- Milestone plan: `~/Dev/overlap/plan.md` — read it. Milestones are labeled M0, M1, M2, …
- **M0–M3 are already DONE.** Your branch `claude/overlap-m4` is cut from `claude/overlap-m3` (tip `59046df`), so all prior milestone work is present. Do NOT redo them. (Note: M1 is already merged to main via PR #1; M2 PR #2 and M3 PR #3 are open.)
- Run `npm install` in the worktree before building/running (fresh worktree has no node_modules).

## Steps
1. Read `~/Dev/overlap/prompt.md` and `~/Dev/overlap/plan.md` fully.
2. Identify exactly what **M4** requires (per the plan).
3. Implement M4 in the worktree, following the conventions established in M0–M3.
4. Verify (build / lint / tests as applicable) and capture the evidence.
5. Write a short M4 summary into this TASK.md under `## M4 Result`, set STATUS to `waiting`, and stop for the user's go-ahead.

## Engineering Constraints (required)
- **Test coverage:** cover all new functionality with tests for both happy and failure paths, using the repo's existing test framework (Vitest).
- **Error observability:** any fallible operation must handle and log errors so failures are observable.
- **Conventions:** follow the target repo's existing patterns (styling, state, testing, config) rather than introducing new ones.

## Output
Write the M4 summary + verification evidence into this TASK.md under `## M4 Result`. Then STATUS = `waiting`.

## Session continuity (required)
When this session grows long, proactively suggest `/handover` to the user before context degrades.

## Status reporting (required)
When you need input (including between milestones): `echo "waiting: <reason>" > STATUS`
When done: `echo "done" > STATUS`
(The orchestrator already wrote `working` to STATUS before opening this tab — do not overwrite it until your state actually changes.)

## M4 Result

Implemented **M4 — Schedule** per `plan.md`. All new code lives in `src/clock/` and `src/App.tsx`; no changes to M0–M3 behavior other than the additive `previewOffsetMs`/`scrubBind` props on `WorldClock`.

**New files**
- `src/clock/geometry.ts` (+tests): added `angleFromCenterOffset`, `angleDelta`, `offsetMsFromAngle` — pure angle/offset math shared by the drag hook.
- `src/clock/useRingScrub.ts`: pointer-drag + arrow-key hook. Drag anywhere on the clock face to rotate a preview at 15°/hour (`DEGREES_PER_HOUR`, matching the existing meeting-dot convention); arrow keys step ±1h for keyboard a11y. Exposes `previewOffsetMs`, `isDragging`, `reset`, `setOffsetMs`, and a `bind` object of pointer/keyboard handlers.
- `src/clock/googleCalendar.ts` (+tests): client-side Google Identity Services (GIS) token flow, gated on `VITE_GOOGLE_CLIENT_ID`. `loadGoogleIdentityServices` injects the GIS script once (cached, with a 10s timeout so a blocked/offline network fails observably instead of hanging); `requestAccessToken` drives the popup token client (with an `error_callback` for a closed/blocked popup — found and fixed via manual browser verification, see below); `createCalendarEvent` POSTs a 30-minute (default) event to the primary calendar's v3 endpoint; `scheduleMeetingOnGoogleCalendar` orchestrates all three and rethrows (each step also logs via `console.error`).
- `src/clock/meetingForm.ts` (+tests): pure helpers — `validateMeetingTitle`, `buildMeeting` (id disambiguation mirrors `locationForm.ts`), `toDatetimeLocalValue`/`fromDatetimeLocalValue` for the `<input type="datetime-local">`. (Named `meetingForm.ts`, not `scheduleForm.ts`, to avoid a case-only filename collision with `ScheduleForm.tsx`.)
- `src/clock/ScheduleForm.tsx` + `.module.css`: schedule-mode panel (same floating-panel-next-to-ControlCluster pattern M2 established for `AddLocationForm`). Shows a gated note when `VITE_GOOGLE_CLIENT_ID` is unset; otherwise a title + datetime-local form. Success → "✓ added" then auto-returns to view mode after 3s; failure shows an inline, retryable error.
- `.env.example`: template for `VITE_GOOGLE_CLIENT_ID`.

**Modified**
- `src/clock/WorldClock.tsx`: accepts `previewOffsetMs`, `scrubBind`, `isScrubbing`. Computes `effectiveNow = now + previewOffsetMs` and uses it for every ring's time/arc/dot, the meeting dots, and the center clock — so dragging in schedule mode previews the whole face at a different instant (verified: working-hours count updates live while dragging). The sweeping second hand stays on true real time (cosmetic, pre-existing `useSweepAngle` behavior, intentionally untouched). The `clockContainer` div gets the scrub bind + `role="slider"`/`tabIndex` only while `mode === 'schedule'`.
- `src/clock/WorldClock.module.css`: grab/grabbing cursor + focus ring for the scrubbable state.
- `src/App.tsx`: wires `useRingScrub`, computes `previewInstant`, renders `ScheduleForm` in the mode panel, resets the scrub offset whenever schedule mode isn't active.
- `.gitignore`: ignore `.env`/`.env.*` (except `.env.example`) — no such rule existed yet and M4 is the first milestone to introduce a real secret-shaped env var.
- `README.md`: one Features bullet + an "Environment variables" section pointing at `.env.example`.

**Verification**
- `npm run build` — clean (tsc -b + vite build).
- `npm run lint` — clean (oxlint, 0 warnings).
- `npm test` — **116/116 passing** (11 files), including 15 new `googleCalendar` tests (config gating, event payload, token success/failure/popup-closed, script load success/failure/timeout, full orchestration) and 8 new `meetingForm` tests, plus 6 new `geometry` tests for the drag math.
- Manual browser verification (Playwright, headless Chromium, against `npm run dev`):
  - Unconfigured (`VITE_GOOGLE_CLIENT_ID` unset): Schedule button opens the gated note, no console errors.
  - Configured: opened the form, dragged from 12 o'clock to 3 o'clock (~90°) and confirmed the datetime-local input advanced exactly 6 hours (90°/15°per hour) and every ring/arc/status count updated live; confirmed ArrowRight adds +1h.
  - Submitting against the real `accounts.google.com/gsi/client` script with a fake client id surfaced `popup_closed` inline within seconds (not stuck on "Scheduling…") — this caught a real bug during manual verification: the initial implementation had no `error_callback`/timeout, so a closed/blocked OAuth popup left the UI hanging forever. Fixed by adding GIS's `error_callback` plus a 10s script-load timeout, both covered by new tests.

**Not touched:** M5 (responsive layout) — out of scope per the M4 boundary.
