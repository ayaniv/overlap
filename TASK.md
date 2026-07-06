# overlap — Milestone Build (M5) + commit, push, PR

## Workspace (code tasks only)
- Repo: overlap (GitHub: `ayaniv/overlap`, `gh` authed as `ayaniv`)
- Branch: claude/overlap-m5
- Branch status: new (branched from claude/overlap-m4, which contains M0–M4)

## Mode: implement → commit → push → open PR
Implement **M5** from the plan, then **commit, push, and open a PR**. (No stop-for-go-ahead this time — complete the full cycle through opening the PR.)

## Context
- Source of truth: `~/Dev/overlap/prompt.md` and the milestone plan `~/Dev/overlap/plan.md` — read both fully first.
- **M0–M4 are already DONE.** Your branch `claude/overlap-m5` is cut from `claude/overlap-m4` (tip `7823ca8`), so all prior milestone work is present. Do NOT redo them.
- The overlap PRs form a **stacked chain**: PR #2 `overlap-m2→main`, PR #3 `overlap-m3→overlap-m2`, M4 → overlap-m3. Keep the chain going: **your M5 PR base = `claude/overlap-m4`** (NOT main), so the PR shows only the M5 diff.
- Run `npm install` in the worktree before building/running (fresh worktree has no node_modules).

## Steps
1. Read `~/Dev/overlap/prompt.md` and `~/Dev/overlap/plan.md` fully; identify exactly what **M5** requires.
2. Implement M5 in the worktree, following the conventions established in M0–M4.
3. Verify: build + lint + tests (Vitest) all green — capture the evidence.
4. Commit with a clear message (match the existing `overlap: M5 …` commit style on this repo).
5. Push the branch: `git push -u origin claude/overlap-m5`.
6. Open the stacked PR:
   `gh pr create --repo ayaniv/overlap --base claude/overlap-m4 --head claude/overlap-m5 --title "M5: <summary>" --body "<what M5 adds + test/verification note>"` — follow any `.github` PR template if present.
7. Capture the PR URL.

## Engineering Constraints (required)
- **Test coverage:** cover all new functionality with tests for both happy and failure paths (Vitest).
- **Error observability:** any fallible operation must handle and log errors so failures are observable.
- **Conventions:** follow the repo's existing patterns (styling, state, testing, config, commit/PR style); no new dependencies unless the milestone truly requires them.
- Confirm the PR opened (non-error `gh` exit + a real URL) before reporting done.

## Output
Write the M5 summary, verification evidence, and the **PR URL** into this TASK.md under `## M5 Result`. Then STATUS = `done`.

## Session continuity (required)
When this session grows long, proactively suggest `/handover` to the user before context degrades.

## Status reporting (required)
When you need input: `echo "waiting: <reason>" > STATUS`
When done (PR opened): `echo "done" > STATUS`
(The orchestrator already wrote `working` to STATUS before opening this tab — do not overwrite it until your state actually changes.)

## M5 Result

Implemented **M5 — Responsive** per `plan.md`. Pure CSS: no new components, hooks, or logic — only media-query rules in the two files the plan named. No new dependencies.

**Modified**
- `src/clock/WorldClock.module.css`: added `@media (orientation: portrait)` block. Portrait/mobile now: scales `.clockContainer` up to `min(165vw, 760px)` (vs. the desktop `min(86vmin, 700px)`) and anchors it high with `margin-top: 68px` + `.stage { align-items: flex-start }`, so the top rings, NOW capsule, and center time dominate the screen while the sides/bottom clip against the stage's existing `overflow: hidden`. Also added `flex-shrink: 0` to the base `.clockContainer` rule — without it, the flex row's default shrink-to-fit was silently clamping the enlarged portrait width back down to the viewport width (caught via computed-style inspection during manual verification, see below). Reflowed `.context` (max-width + smaller type so the two-line headline can't run under the button cluster), `.modePanel` (tighter offset to match the shrunk cluster), and `.statusRow` (switches to a centered, wrapped column instead of a fixed-gap nowrap row, which was overflowing/clipping horizontally on narrow screens).
- `src/clock/ControlCluster.module.css`: added a matching portrait rule shrinking the button cluster's padding/font-size/gap and offset so it clears the reflowed header text.

**Not touched:** `src/clock/WorldClock.tsx`, `App.tsx`, and every other component/hook — M5 is styling-only, per the plan.

**Test coverage:** no new Vitest tests — M5 introduces no new functions, hooks, or branching logic (pure CSS media queries), so there is no new unit-testable behavior; the existing 116 tests are an unaffected regression baseline (still 116/116 green, see below). Verified visually instead, per the plan's own verification method for this milestone (Playwright screenshots).

**Verification**
- `npm run build` — clean (tsc -b + vite build).
- `npm run lint` — clean (oxlint, 0 warnings).
- `npm test` — **116/116 passing** (11 files, unchanged from M4 — no regressions).
- Manual browser verification (Playwright, headless Chromium, against `npm run dev`), screenshots at the plan's specified sizes:
  - **1280×800 (desktop/landscape)**: pixel-identical to pre-M5 (portrait rule doesn't apply) — confirmed no regression.
  - **390×844 (mobile portrait)**: before this milestone, the header text visibly collided with the Edit/Schedule/Share buttons and the bottom status row's text overflowed/clipped past the viewport edges (confirmed via a baseline screenshot). After: header, cluster, and clock all clear each other; the clock is markedly larger and anchored to the top of the screen with San Francisco/New York's arcs clipping off the left/right edges by design; the status row wraps into two centered lines that fit within the viewport. Also opened Edit mode at this size to confirm the mode panel (`AddLocationForm`) still fits fully on-screen alongside the shrunk cluster.
  - **844×390 (mobile landscape)**: renders via the default (non-portrait) rules, same layout family as desktop, correctly scaled down — no overlap or clipping issues.

**PR:** see below once opened.
