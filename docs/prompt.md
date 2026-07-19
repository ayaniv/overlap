# Orchestrator prompt — build `overlap` one milestone at a time

Paste this to the orchestrator.

---

Execute the approved implementation plan at `~/Dev/time-spinner/plan.md` (repo root) **one milestone at a time, sequentially** (not in parallel). The project is currently `~/Dev/time-spinner` (a static React + Vite + TypeScript radial world clock, clean at commit `c3a19ca`); **M0 renames it to `~/Dev/overlap`** — after that, this plan and prompt live at `~/Dev/overlap/docs/plan.md` and `~/Dev/overlap/docs/prompt.md`.

## How to run
- Dispatch **one worker agent per milestone**, in its own worktree/tab, scoped to exactly that milestone from `plan.md`.
- Do **not** start a milestone until the previous one is: merged to `main`, green on `npm run build` + `npm run lint` + `npm test`, and (M0) deployable.
- After each milestone reaches STATUS `done` and is merged, **stop and report** (what shipped, what's next). Wait for me to say "next" before dispatching the following milestone. (If I say "continue through all", proceed automatically with the same verification gates.)
- The full milestone specs, file lists, and per-milestone verification steps live in `plan.md` — give each worker the relevant milestone section verbatim.

## Milestone order (dependency-correct)
1. **M0 — Rename + Vercel + `plan.md`.** Rename dir/repo/remote → `overlap`, update `package.json`/`index.html`/`README` (+ live-demo badge → `https://overlap.vercel.app`), commit `plan.md` + `prompt.md` (already in the repo root), add minimal Vercel config. Blocks everything.
2. **M1 — Config foundation + app scaffolding.** `types.ts` (Location/Meeting/ClockConfig), `shareCodec.ts` (lz-string), `useClockConfig.ts` (URL hash → localStorage → defaults), `mode` state + `ControlCluster` shell, `WorldClock` refactor to `Location[]` + per-location color/work-hours + radius band [160,392] + center-content slot + meeting-dots pass. Blocks M2/M3/M4.
3. **M2 — Edit locations.** `cityCatalog.ts` (`@vvo/tzdb`), `AddLocationForm` (typeahead + label + color swatches/hex/native picker + per-location work hours), edit mode, X-remove on rings.
4. **M3 — Share.** `Toast` + Share button copies `location.href` (already carries `#c=`).
5. **M4 — Schedule.** `useRingScrub` (drag rotates rings → preview offset, 15°/hr), `googleCalendar.ts` (client-side GIS, gated on `VITE_GOOGLE_CLIENT_ID`), schedule mode, persistent meeting **marker dot** on the ring at the meeting time.
6. **M5 — Responsive.** Portrait/landscape/mobile CSS (portrait scales up + anchors high per the plan's vertical reference).

## Constraints (every milestone)
- Backend-free / static; only new deps allowed are `@vvo/tzdb` and `lz-string`; TypeScript strict.
- Must pass `npm run build`, `npm run lint`, `npm test` before merge.
- Verify visually with the Playwright scripts in the session scratchpad where the plan calls for it.

Start with **M0**.
