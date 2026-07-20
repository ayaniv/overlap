# "Find time to meet" button

## Problem

Finding a time that works across several timezones today means manually
dragging the clock ring (`useRingScrub`) and eyeballing which rings' working-
hours arcs (`geometry.ts` / `cityTime.ts`) line up — there's no way to jump
straight to the best available time, and no way to see *which* time is best
when nobody's hours line up perfectly (which timezone-spanning teams will hit
constantly). The app already tracks in/out-of-hours per city; this feature
adds a single button that searches across those existing arcs and lands the
clock on the best simultaneous window, reusing the existing scrub-preview
mechanics (`previewOffsetMs`, the Cancel/Schedule action bar) rather than
building a parallel "found time" UI.

## Decisions locked during brainstorming

- **Home is always included in the search and can never be excluded.** It's
  the developer's own anchor timezone — every other city ("ring") is
  optional. Home gets no checkbox.
- **The algorithm is a sweep-line max-overlap search, not sampling.** For
  each included city (home + checked rings), build one interval expressed in
  *hours from now* — `[hoursUntilWindowStart, hoursUntilWindowEnd]` — using
  each city's own `frac`/`workStart`/`workEnd` (via the existing
  `getCityTime`/`isWithinWorkingHours`, one city at a time, never compared
  cross-timezone directly). A city already inside its working hours gets a
  window starting at `0` (now) rather than "tomorrow." Sweeping across all
  cities' interval start/end events (classic "point of maximum overlap"
  technique, related to Marzullo's algorithm) finds the offset-from-now with
  the most simultaneously-in-hours cities, exactly — no discretized sampling,
  no missed transitions.
- **Two-pass fallback for "stretch."** Pass 1 sweeps the strict windows. If
  the max overlap found there doesn't cover every included city, pass 2
  re-sweeps each city's window **widened by 1 hour on each side** (clamped so
  a widened start never goes before "now") and takes that result instead if
  it covers more cities. This directly implements the task's "let cities
  stretch their day a bit rather than making the meeting impossible" — a
  city counts as **`in-hours`** (strict window), **`stretched`** (only the
  widened window), or **`out`** (neither).
- **Scoring/tie-break, 3 levels**: `fitCount` (in-hours + stretched cities)
  desc → `perfectCount` (strictly in-hours cities) desc → soonest offset asc.
  No separate "total stretch minutes" tiebreak — unnecessary once ties are
  broken by soonest offset.
- **Landing times are quarter-hour-aligned.** The search's first candidate
  is the next `:00`/`:15`/`:30`/`:45` boundary at or after "now" (e.g. 14:34
  → first candidate 14:45), not raw `now + 15min` — so results always land
  on clean, schedulable times. The sweep's exact-offset answer is snapped
  forward to this grid.
- **No toast for the result.** The existing status row (`X/Y teams available
  • local working hours`) already communicates coverage in real time once
  the clock lands — no new copy needed to distinguish "perfect" from
  "compromise."
- **Button**: labeled **"Find Time"** with a sparkle/magic-wand icon (new
  icon component, following the existing `src/clock/icons/*.tsx` pattern) —
  not icon-only, since there's no obvious single-glyph metaphor for
  "optimize across timezones" the way Config/Share have one.
- **Button placement is layout-dependent on scrub state**, both driven by
  `ControlCluster.tsx`:
  - **View mode** (no scrub/found-result active): `Find Time` renders as an
    **always-visible primary** button immediately left of the hamburger
    toggle — *not* tucked behind the toggle's expand/collapse like
    Config/Share are. It stays visible whether the hamburger is collapsed or
    expanded. Hidden entirely when `rings.length === 0` (nothing to search
    against).
  - **Scrub/found-result mode** (any nonzero `previewOffsetMs`, whether from
    a manual drag or a found result): the existing Cancel/Schedule bar gains
    a middle **secondary** "Find Time" button — `Cancel (secondary) | Find
    Time (secondary) | Schedule (primary)`. Clicking it here always runs a
    **fresh** search (all rings re-included, ignoring the current preview
    position) rather than refining the current one.
  - **Exception**: when the preview matches an existing scheduled meeting
    (`scrubActions.matchedMeeting`), the cluster still shows only the lone
    "Remove Meeting" button, unchanged — no Find Time squeezed in there.
- **Landing reuses the existing scrub-preview machinery.** Clicking Find
  Time animates `previewOffsetMs` from its current value to the found offset
  (see Architecture below), which is exactly what already drives every ring/
  arc/dot on the face (`WorldClock.tsx`'s `effectiveNow`) and what already
  triggers the Cancel/Schedule bar. One adjustment: that bar's visibility
  condition (`previewOffsetMs !== 0`) is widened to
  `previewOffsetMs !== 0 || isFindResultActive`, since a legitimately
  "found" result can be offset `0` (now is already optimal — see edge cases
  below).
- **Per-ring inclusion is a checkbox, not a delete/X button** (revised
  during brainstorming from the task's original "X filter" framing — a
  checkbox reads as far less destructive and naturally supports re-adding
  without a separate undo affordance). Rendered **only while a find result
  is active**, positioned at each ring's existing dot anchor
  (`pointOnCircle(labelRadius, 0)` — the same point already sitting between
  the curved name and time labels; validated in the visual-companion mockup
  as the simplest placement, since it needs zero new geometry versus
  measuring label text width). Checked by default; unchecking a ring
  **immediately re-runs the search** excluding it (auto re-trigger, not a
  second button click) and re-animates to the new result; re-checking
  re-includes and re-searches the same way.
- **Minimum-city guard**: when only one ring remains checked, its checkbox
  renders `disabled` (still checked, can't be unchecked further) — home plus
  at least one ring must always stay in the search.
- **Stretched rings get a distinct arc treatment**, visible only while a
  find result is active: `in-hours` cities keep today's solid/bright arc,
  `stretched` cities render a dashed/amber arc, `out` cities keep today's
  existing muted/out-of-hours look. Outside of an active find result, every
  ring renders exactly as it does today (plain in-hours/out-of-hours,
  2-state).
- **Exit is only via the existing Cancel/Schedule/Remove-Meeting actions**
  (all of which already call `resetScrub()`) — clearing the found-result
  state (checkboxes, stretched-arc styling) piggybacks on those same calls,
  no new teardown path. A manual drag on top of a landed find result is
  still allowed (not blocked, unlike the scrub-hint tutorial overlay which
  intentionally blocks real dragging) but doesn't itself clear
  `isFindResultActive`; a stale checkbox/arc display while manually
  scrubbing further is an accepted minor edge case, not engineered around.
- **Edge cases**, all handled naturally by the algorithm rather than special-
  cased: a single remaining ring is trivially "perfect" at any time inside
  its own hours (sweep of one window always finds `fitCount === totalCount`
  immediately); "now" already being optimal returns offset `0` (no sweep
  animation needed — the hook just doesn't move); zero rings hides the
  button entirely (see above).
- **Analytics** (via the existing `useAnalytics().trackEvent` abstraction):
  `find_meeting_time_clicked` with `{ ring_count, fit_count, perfect_count,
  is_perfect }`; `find_meeting_time_city_excluded` /
  `find_meeting_time_city_included` with `{ remaining_count }` on each
  checkbox toggle. Scheduling from a found time reuses the existing
  `meeting_scheduled` event unchanged — no new event needed there.

## Architecture

New files:

```
src/clock/findMeetingTime.ts        — pure algorithm: builds per-city hours-from-now
                                       windows, sweeps for max overlap (strict pass,
                                       then widened-stretch pass if needed), returns
                                       the winning offset + per-city in-hours/stretched/
                                       out classification. No React, no timers.
src/clock/useFindMeetingTimeSweep.ts — small rAF hook that eases `previewOffsetMs`
                                       from its current value to an arbitrary target
                                       over a fixed duration. Modeled directly on the
                                       existing useScrubHintReturn.ts (reuses
                                       easedBetween from easing.ts and the same
                                       duration convention) — generalized to any
                                       target instead of hard-coded 0.
src/clock/icons/SparkleIcon.tsx      — new icon for the Find Time button, following
                                       the existing icon components' shape/props.
```

Modified files:

```
src/clock/ControlCluster.tsx — new Find Time button in both the view-mode row
                                (always visible, primary) and the scrub-action bar
                                (secondary, between Cancel and Schedule); new
                                ScrubActions.onFindTime callback.
src/clock/WorldClock.tsx     — ringViews gains a 3-state status (in-hours/stretched/
                                out) while a find result is active; renders a
                                checkbox overlay per ring at the dot anchor;
                                isScrubActionBarVisible widened to include
                                isFindResultActive.
src/App.tsx                  — owns excludedRingIds (Set, reset each fresh Find Time
                                click), isFindResultActive, the last find-time result
                                (for per-ring status); handleFindTime and
                                handleToggleRingIncluded call findMeetingTime.ts and
                                drive useFindMeetingTimeSweep's setOffsetMs (the same
                                setter useRingScrub already exposes); all find-result
                                state is cleared at the same resetScrub() call sites
                                already used by Cancel/Schedule/Remove-Meeting/idle.
```

`findMeetingTime.ts`'s exported shape:

```ts
export type CityFitStatus = 'in-hours' | 'stretched' | 'out';
export type CityFitResult = { id: string; status: CityFitStatus };
export type FindMeetingTimeResult = {
  offsetMs: number;
  perfectCount: number;
  fitCount: number;
  totalCount: number;
  cityResults: CityFitResult[]; // home first, then included rings
};

export function findBestMeetingOffset(
  now: Date,
  home: Location,
  includedRings: Location[],
): FindMeetingTimeResult;
```

`includedRings` is pre-filtered by the caller (`App.tsx`, using
`excludedRingIds`) — the algorithm itself never needs to know about
exclusion, keeping it a simple function of "which cities am I optimizing
for."

## Testing

- `findMeetingTime.test.ts`: perfect-fit case (all cities share real hours);
  the no-overlap-until-stretched case (two cities whose strict windows have a
  gap, only the widened pass finds a fit — the worked example from
  brainstorming); single-ring trivial case; already-optimal-now case
  (`offsetMs === 0`); tie-break prefers soonest offset; quarter-hour
  alignment of the returned offset.
- `useFindMeetingTimeSweep.test.ts`: mirrors `useScrubHintReturn.test.ts` —
  eases `setOffsetMs` from a start value to an arbitrary target over the
  fixed duration; respects `prefers-reduced-motion`.
- `ControlCluster.test.tsx`: Find Time button present/hidden per
  `rings.length`; present in both view-mode and scrub-action-bar layouts;
  absent when `matchedMeeting` is set.
- `WorldClock.test.tsx`: checkboxes render only while a find result is
  active, at the correct testid per ring; the last checked ring's checkbox
  is `disabled`; stretched rings get the distinct arc class; unaffected
  rendering when no find result is active.
- `App.test.tsx`: full click → land → uncheck a ring → re-lands excluding it
  → re-check → re-lands including it again flow; Cancel clears the find
  result and checkboxes; Schedule from a found time still fires the existing
  `meeting_scheduled` event unchanged; analytics events fire with the
  documented payloads.

## Out of scope

- No change to `useRingScrub.ts` itself — `setOffsetMs` already exists and
  is reused as-is by the new sweep hook.
- No handling of a manual drag *after* landing on a find result beyond what
  falls out naturally (see the "Exit" decision above) — re-syncing
  checkboxes/arc styling to a manually-adjusted offset is not built.
- No weekday/weekend awareness — matches the existing working-hours arc
  model, which already treats every day as a workday.
- No second-day search: only the next occurrence of each city's window
  within the following 24h is considered, matching the button's "find the
  next good time" framing rather than an open-ended calendar search.
