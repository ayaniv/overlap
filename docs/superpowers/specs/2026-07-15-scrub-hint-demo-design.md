# First-time scrub hint (`ScrubHint` / `useScrubHintDemo`)

## Problem

Dragging the clock ring to preview a different time is the app's core
interaction, but nothing on the page teaches a first-time visitor that it's
possible — the "Schedule" affordance itself only appears once a time is
already being previewed (`ControlCluster.tsx`), so a new user who never
tries dragging never discovers scheduling either. Google's OAuth
verification checklist separately flagged this same discoverability gap
(see `docs/GOOGLE_VERIFICATION.md` on `claude/google-oauth-verification-response`)
as something the demo video needs to narrate around, since the UI doesn't
make it obvious on its own.

overlap is also used as an always-on ambient display (a "wall clock" in an
office), not just a personal app someone actively drives — so any onboarding
UI must never appear, or get stuck, on a screen nobody is touching.

## Decisions locked during brainstorming

- **Dismissal is explicit only.** The hint disappears when "Got it" is
  clicked — never merely by the user starting to drag. Real dragging is
  blocked entirely while the hint is showing (see below), so there's no
  ambiguity about which action counts as dismissal.
- **Real dragging is blocked while the hint is visible.** The hint's demo
  animation drives the *same* `previewOffsetMs` state a real drag would, so
  letting a real pointer/keyboard drag through concurrently would fight the
  demo over the same offset. `scrubBind` is passed as `undefined` to
  `WorldClock` while the hint is active — the same mechanism `mode ===
  'edit'` already uses via `canScrub`.
- **The demo animates the real clock, not a decorative copy.** The hint's
  hand position and the clock's preview both derive from one hook
  (`useScrubHintDemo`) driving `useRingScrub`'s existing `setOffsetMs` —
  reusing 100% of the real rendering path (rings, center time, meeting-dot
  highlighting) rather than faking a parallel visual that could drift from
  the real one as the app evolves.
- **Loops until dismissed**, not a single play-through — a user who glances
  away and back should still catch the demonstration.
- **Hand graphic is a plain emoji** (👆), CSS/JS-positioned — no new SVG/image
  asset, matching the codebase's no-new-dependency convention.
- **Gated on genuine, current user presence** — not just "hasn't been
  dismissed yet":
  - Never shows at all until the user has produced at least one real
    activity event (a new one-shot `hasBeenActive` signal) — a kiosk/big-
    screen display that's never actually touched must never show it, not
    even briefly on page load.
  - Hides immediately (not just pauses) if the existing `useIsIdle()` (8s,
    `useIsIdle.ts`) flips to idle — an ambient-display viewer who walked
    away shouldn't come back to a hint frozen mid-sweep.
  - Reappears if activity resumes and it still hasn't been dismissed —
    idle/active is a live gate, not a one-shot check; only the localStorage
    dismissal flag is permanent.
- **`useIsIdle()` is hoisted from `WorldClock.tsx` up to `App.tsx`**, passed
  down as a prop, so both the existing chrome-fade behavior and this new
  gate share one idle-timer instance instead of running two independent
  listener sets for the same question. `useHasBeenActive` is a **separate**
  new hook (not merged into `useIsIdle`) so the existing hook's behavior and
  tests are untouched.
- **`useHasBeenActive` tracks `pointermove`/`pointerdown`/`touchstart` only —
  not `keydown`** (updated during plan-writing; see the implementation
  plan's "Deviation from the approved spec" note for the full reasoning).
  Sharing `useIsIdle`'s full activity list would let the same arrow-key
  press that performs a real keyboard scrub also flip this hook true,
  risking the hint activating mid-gesture and yanking `scrubBind` away from
  a keyboard-only user who's already successfully using it.
- **Persistence follows the `googleCalendar.ts` convention exactly**: a
  `localStorage` key (`overlap:scrub-hint-seen:v1`), a getter/setter pair
  with try/catch (never a raw `localStorage` call at the point of use), read
  once via `useState(() => hasSeenScrubHint())` in `App.tsx`.
- **Respects `prefers-reduced-motion: reduce`** — the same `matchMedia`
  check `useSweepAngle.ts` already uses. When set, the demo loop never
  runs; the hand/clock sit static while the text + button are still shown
  (accessibility gate, independent of the presence/idle gates above).

## Architecture

New files:

```
src/hooks/useHasBeenActive.ts   — one-shot "has any real activity ever occurred" latch
src/clock/useScrubHintDemo.ts   — rAF loop driving setOffsetMs + returning phase
src/clock/scrubHint.ts          — localStorage get/set, mirrors googleCalendar.ts
src/clock/ScrubHint.tsx         — the overlay: hand + text + "Got it" button
src/clock/ScrubHint.module.css  — overlay styles
```

Modified files:

```
src/hooks/useIsIdle.ts   — unchanged internally; call site moves
src/clock/WorldClock.tsx — drops its own useIsIdle() call, takes isIdle as a prop;
                           renders <ScrubHint> inside .clockContainer when active
src/App.tsx              — owns isIdle, hasBeenActive, showScrubHint state;
                           wires useScrubHintDemo; gates scrubBind
```

### `useHasBeenActive`

```ts
// src/hooks/useHasBeenActive.ts
export function useHasBeenActive(): boolean {
  // same ACTIVITY_EVENTS list as useIsIdle; flips true once, permanently,
  // on the first pointermove/pointerdown/keydown/touchstart, then removes
  // its own listeners (nothing left to observe once latched)
}
```

### `useScrubHintDemo`

```ts
// src/clock/useScrubHintDemo.ts
export const SCRUB_HINT_AMPLITUDE_MS = 90 * 60_000; // ±90 minutes
export const SCRUB_HINT_PERIOD_MS = 2_500;

export function useScrubHintDemo(params: {
  active: boolean;
  setOffsetMs: (ms: number) => void;
}): { phase: number } {
  // requestAnimationFrame loop while `active`; phase advances at
  // 2π / SCRUB_HINT_PERIOD_MS per ms; offsetMs = SCRUB_HINT_AMPLITUDE_MS *
  // Math.sin(phase); calls setOffsetMs(offsetMs) every frame.
  // Skips the loop entirely if matchMedia('(prefers-reduced-motion: reduce)')
  // matches — phase stays 0, hand/clock stay static.
  // Cancels the rAF on active -> false or unmount.
}
```

### `ScrubHint`

```ts
// src/clock/ScrubHint.tsx
type ScrubHintProps = {
  phase: number;
  totalRings: number; // needed for sweepHandOuterRadius(totalRings)
  onDismiss: () => void;
};
```

Renders `null` when not meant to be shown (conditionally rendered by the
caller, not internally — mirrors `Toast.tsx`'s `return null` pattern so
"not shown" means "not in the DOM," not "hidden via CSS"). When rendered:
absolutely positioned (`inset: 0`) sibling inside `.clockContainer`,
alongside `.glassDisc` / the SVG / `.centerOverlay`. Contains:

- The hand (`👆`), positioned via the existing angle math:
  `angleDeg = (offsetMs / MS_PER_HOUR) * DEGREES_PER_HOUR` (inverse of
  `offsetMsFromAngle`), where `offsetMs = SCRUB_HINT_AMPLITUDE_MS *
  Math.sin(phase)`, then `pointOnCircle(sweepHandOuterRadius(totalRings),
  angleDeg)` (`geometry.ts`) for the `{x, y}` in the shared 0–1000 space,
  converted to `left/top` percentages (`x/10 + '%'`, `y/10 + '%'`) with
  `transform: translate(-50%, -50%)`. This sweeps the hand in a small arc
  (±22.5° at ±90min) right around the "NOW" triangle at the top of the
  dial — where the sweep hand already rides "just outside the tick bezel."
- Text: "Find the right time to schedule a meeting."
- A "Got it" button calling `onDismiss`.

### Data flow (`App.tsx`)

```ts
const isIdle = useIsIdle();                 // hoisted from WorldClock.tsx
const hasBeenActive = useHasBeenActive();
const [showScrubHint, setShowScrubHint] = useState(() => !hasSeenScrubHint());

const scrubHintActive = showScrubHint && mode === 'view' && hasBeenActive && !isIdle;

const { phase } = useScrubHintDemo({ active: scrubHintActive, setOffsetMs: scrubSetOffsetMs });

const handleDismissScrubHint = useCallback(() => {
  markScrubHintSeen();
  setShowScrubHint(false);
  resetScrub();
  analytics.trackEvent('scrub_hint_dismissed');
}, [resetScrub, analytics]);
```

- `scrubBind={canScrub && !scrubHintActive ? scrubBind : undefined}` passed
  to `WorldClock` — blocks real drag input while the hint is active, same
  pattern `canScrub` already uses for `mode === 'edit'`.
- If `scrubHintActive` flips `false` because `isIdle` became `true` (not
  because of dismissal), `App.tsx` also calls `resetScrub()` so the ambient
  display falls back to real "now" instead of freezing mid-sweep.
- `isIdle` is passed down to `WorldClock` as a prop (replacing its internal
  `useIsIdle()` call) so `isChromeHidden` keeps working unchanged.

## Testing

- `useHasBeenActive.test.ts` — starts `false`; flips permanently `true`
  after a simulated activity event; stays `true` regardless of subsequent
  idle time.
- `useScrubHintDemo.test.ts` — `setOffsetMs` is called with an oscillating
  sequence while `active`; stops being called once `active` flips `false`;
  never runs when `prefers-reduced-motion: reduce` is mocked to match.
- `scrubHint.test.ts` — get/set localStorage helper, mirrors
  `googleCalendar.test.ts`'s shape for `isGoogleCalendarConnected`.
- `ScrubHint.test.tsx` — renders hand/text/button when given props; clicking
  "Got it" calls `onDismiss`.
- `App.test.tsx` additions:
  - After simulated activity + not-idle + `mode: 'view'` + no prior
    dismissal, the hint (its "Got it" button) is present exactly once.
  - Clicking "Got it" removes it from the DOM immediately (not just
    visually) — assert absence, not a hidden/invisible state.
  - Remounting afterward (simulating a reload) never shows it again,
    because `hasSeenScrubHint()` now reads `true`.
  - Dismissal writes exactly `overlap:scrub-hint-seen:v1 = 'true'` to
    localStorage.
  - A fresh mount with that key already set never renders the hint, even
    with activity + not-idle + view mode all otherwise satisfied.
  - Simulating idle (`isIdle: true`) while the hint would otherwise be
    active removes it from the DOM (not just pauses its animation).
  - With no activity simulated at all (`hasBeenActive: false`), the hint
    never renders, regardless of idle state.

## Out of scope

- No touch-vs-mouse copy differentiation (the app has no existing
  `pointer: coarse` detection to hook into; scrubbing already works
  identically for both via Pointer Events).
- No change to `useRingScrub.ts` itself — `setOffsetMs` already exists and
  is reused as-is.
- No visual backdrop/scrim behind the hint — only the clock-face area is
  covered; the rest of the page (menu, share button, etc.) stays visible
  but the hint's overlay physically blocks pointer events reaching the ring
  underneath it.
