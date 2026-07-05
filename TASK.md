# overlap — Milestone Build (M3)

## Workspace (code tasks only)
- Repo: overlap
- Branch: claude/overlap-m3
- Branch status: new (branched from claude/overlap-m2, which contains M0 + M1 + M2)

## Mode: implement
Implement **M3 only** from the plan, then STOP and set STATUS to `waiting` for the user's go-ahead before starting M4. Do not skip ahead. Do not run past the M3 boundary without an explicit go-ahead.

## Context
- Source of truth: `~/Dev/overlap/prompt.md` — read it in full first.
- Milestone plan: `~/Dev/overlap/plan.md` — read it. Milestones are labeled M0, M1, M2, …
- **M0, M1, M2 are already DONE.** Your branch `claude/overlap-m3` is cut from `claude/overlap-m2` (commit `5c1cf92`), so all prior milestone work is present. Do NOT redo them.
- Run `npm install` in the worktree before building/running (fresh worktree has no node_modules).

## Steps
1. Read `~/Dev/overlap/prompt.md` and `~/Dev/overlap/plan.md` fully.
2. Identify exactly what **M3** requires (per the plan).
3. Implement M3 in the worktree, following the conventions established in M0–M2.
4. Verify (build / lint / tests as applicable) and capture the evidence.
5. Write a short M3 summary into this TASK.md under `## M3 Result`, set STATUS to `waiting`, and stop for the user's go-ahead.

## Engineering Constraints (required)
- **Test coverage:** cover all new functionality with tests for both happy and failure paths, using the repo's existing test framework (Vitest).
- **Error observability:** any fallible operation must handle and log errors so failures are observable.
- **Conventions:** follow the target repo's existing patterns (styling, state, testing, config) rather than introducing new ones.

## Output
Write the M3 summary + verification evidence into this TASK.md under `## M3 Result`. Then STATUS = `waiting`.

## Session continuity (required)
When this session grows long, proactively suggest `/handover` to the user before context degrades.

## Status reporting (required)
When you need input (including between milestones): `echo "waiting: <reason>" > STATUS`
When done: `echo "done" > STATUS`
(The orchestrator already wrote `working` to STATUS before opening this tab — do not overwrite it until your state actually changes.)

## M3 Result

Implemented M3 — Share (C) on top of M1's config foundation, on branch `claude/overlap-m3` (worktree `~/Dev/worktrees/overlap-m3`).

**What shipped:**
- `src/clock/share.ts` — `copyShareLink(clipboard, href)`: writes `href` to a clipboard passed in explicitly (so the caller supplies `navigator.clipboard`, keeping the module free of a global dependency and trivially testable); wraps the write in try/catch, logs via `console.error('overlap: failed to copy share link', err)` and returns `false` on any failure (rejected promise, synchronous throw, or a missing/undefined clipboard), `true` on success — matches the repo's established fallible-operation pattern (`shareCodec.ts`, `useClockConfig.ts`).
- `src/hooks/useToast.ts` — small hook (mirrors `useNow.ts`'s style) holding a transient `message: string | null` with an internal timer; `showToast(text)` sets the message and auto-clears it after 2.6s, restarting the timer on repeat calls; cleans up the pending timeout on unmount.
- `src/clock/Toast.tsx` (+ `.module.css`) — presentational toast bubble anchored under the top-right `ControlCluster`, `role="status" aria-live="polite"` for a11y consistent with the rest of the clock's screen-reader status line; renders nothing when `message` is `null`.
- `src/clock/WorldClock.tsx` — new optional `toastMessage` prop, renders `<Toast>` alongside `<ControlCluster>` inside the stage.
- `src/App.tsx` — `handleShare` now calls `copyShareLink(navigator.clipboard, window.location.href)` (the href already carries the persisted `#c=` share payload via `useClockConfig`'s hash-mirroring from M1) and shows "Link copied" on success or "Couldn't copy link" on failure via `useToast`.

**Tests (Vitest, happy + failure paths):**
- `share.test.ts` — success (writes href, returns `true`); clipboard promise rejection (returns `false`, logs exactly once); clipboard method throwing synchronously (returns `false`, logs exactly once).
- No new test file for `Toast.tsx`/`useToast.ts` — consistent with the repo's existing convention (no jsdom/testing-library; `useNow.ts`, `useSweepAngle.ts`, `ControlCluster.tsx` etc. are UI/timing wiring left untested, while every fallible/pure operation is pulled into its own tested module). All new logic that can fail (the clipboard write) lives in `share.ts` and is fully covered.

**Verification evidence:**
- `npm run build` (`tsc -b && vite build`) — clean, no type errors.
- `npm run lint` (`oxlint`) — clean, exit 0.
- `npm test` (`vitest run`) — 8 test files, 62 tests, all passing (up from 7 files / 59 tests pre-M3).
- End-to-end via throwaway Playwright scripts against `npm run dev` (clipboard permissions granted): clicked Share → toast showed "Link copied" → read `navigator.clipboard` and confirmed it exactly matches `page.url()` (the `#c=` link) → toast auto-dismissed after ~2.6s. Second script: added a custom location (Tokyo) in one context, clicked Share, copied the link, then opened that exact URL in a **fresh** browser context with no localStorage — confirmed "Tokyo" renders, proving the share link alone reproduces the clock (per the plan's own M3 verification spec: "copy link → fresh context renders from `#c=`").

**Not in scope (left for later milestones per the plan):** Schedule/Google Calendar (M4), responsive layout (M5).

STATUS: `waiting` — ready for go-ahead to start M4.
