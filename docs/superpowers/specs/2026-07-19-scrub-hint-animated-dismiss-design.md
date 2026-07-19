# Animated scrub-hint dismissal (`useScrubHintReturn`)

## Problem

Clicking "Got it" on the first-time scrub hint currently snaps the clock back
to the current time in a single frame. `handleDismissScrubHint` (App.tsx) calls
`resetScrub()`, which sets `previewOffsetMs` straight to `0`, so the hand and
every ring jump ~3 hours instantly.

The demo that precedes it is carefully eased (`useScrubHintDemo`'s two phases,
`easeInOutCubic`, continuous velocity at the reversal point). Ending that with a
hard cut undoes the impression the animation just built, and — more practically
— a jump gives the user no visual thread back to "now". They lose track of where
the clock landed relative to where it was.

## Goal

"Got it" animates the clock back to the current time. When that animation
finishes, the hint is dismissed and its overlay is gone.

## Decisions locked during brainstorming

- **The tooltip leaves immediately; the hand rides back.** On click, the "Got
  it" tooltip fades out (~200ms) while the scrim and 👆 hand stay mounted and
  track the offset back to now. The overlay clears once the hand lands. Keeping
  the tooltip up for the whole return would read as an unresponsive button;
  dropping the hand too would sever the visual link to the motion.
- **The `localStorage` flag is written on click, not on completion.**
  `markScrubHintSeen()` fires synchronously in the click handler; only the
  on-screen dismissal (`setIsScrubHintUnseen(false)`) waits for the animation.
  A reload mid-animation must not resurrect a hint the user explicitly
  dismissed.
- **Reduced motion skips the animation entirely**, matching
  `useScrubHintDemo`'s existing precedent of bailing out under
  `prefers-reduced-motion`. Since the demo never swept in that case, the offset
  is already `0` — there is nothing to return from, and behavior is identical
  to today's.
- **A separate hook, not a third phase on `useScrubHintDemo`.** That hook's
  contract is "play the one-shot attract sweep." The return is triggered by a
  user action, needs independent cancellation, and reports completion. Folding
  both into one hook would give it two unrelated trigger conditions.
- **The return is not interruptible.** For its ~600ms the hint's existing
  interaction block stays in force. Making a mid-return drag grab the clock
  would require unwinding the `scrubBind` gating; deferred as out of scope
  unless it feels wrong in practice.

## Architecture

### New: `src/clock/useScrubHintReturn.ts`

Structurally a sibling of `useScrubHintDemo`: a one-shot `requestAnimationFrame`
loop driving `useRingScrub`'s `setOffsetMs`.

```ts
useScrubHintReturn({
  active: boolean,
  fromOffsetMs: number,
  setOffsetMs: (ms: number) => void,
  onComplete: () => void,
});
```

- Eases `fromOffsetMs → 0` over `RETURN_MS` (600) with `easeInOutCubic`.
- `fromOffsetMs` is the live offset at click time, **not** an assumed
  `ANGLE_REST_DEG` — clicking "Got it" mid-sweep must return from wherever the
  hand actually is. The hook snapshots it into a ref on the render where
  `active` flips true, and animates against that snapshot. It must **not** be a
  reactive dependency of the animation effect: the hook itself drives
  `previewOffsetMs`, so re-reading the prop each render would restart the
  animation from its own output on every frame.
- Calls `onComplete` exactly once, after the final frame.
- Under `prefers-reduced-motion`, short-circuits: no animation, `onComplete`
  immediately.
- Cleanup cancels the pending frame on unmount or when `active` goes false.

### Shared easing: `src/clock/easing.ts`

`easeInOutCubic` and `easedBetween` currently live in `useScrubHintDemo.ts`.
Both hooks need them, so they move to a small shared module and are imported by
each — the same consolidation applied to `animations.module.css`, rather than a
second copy.

### App state

One new piece of state: `isDismissingHint`.

```
handleDismissScrubHint()
  markScrubHintSeen()                    // localStorage, immediately
  analytics.trackEvent('scrub_hint_dismissed')
  setIsDismissingHint(true)

useScrubHintDemo({  active: isScrubHintActive && !isDismissingHint })
useScrubHintReturn({ active: isDismissingHint, onComplete })

onComplete()
  setIsScrubHintUnseen(false)   // overlay unmounts
  setIsDismissingHint(false)
  resetScrub()                  // lands exactly on 0
```

`isScrubHintUnseen` remaining true throughout the return is what keeps the
scrim, hand, and click-blocker mounted — no additional render condition is
needed. Gating `useScrubHintDemo` off `!isDismissingHint` is what prevents the
two rAF loops from fighting over `setOffsetMs` when "Got it" is clicked
mid-sweep; the demo hook's cleanup cancels its in-flight frame.

### Tooltip fade-out

`ScrubHint` gains an `isDismissing` prop. While true, the tooltip carries an
additional `.tooltipLeaving` class composing a new `fadeOut` keyframe added to
`animations.module.css` — extending the shared module rather than declaring a
second set of opacity keyframes. Conditional class application in the TSX,
matching the `scrubActionsFade` pattern in `ControlCluster.tsx`.

## Edge cases

| Case | Behavior |
|---|---|
| Reduced motion | Offset is already 0; hook short-circuits, `onComplete` fires immediately. Indistinguishable from today. |
| "Got it" clicked mid-sweep | Demo hook deactivates and cancels its frame; return starts from the live offset. |
| Idle kicks in mid-return | The existing idle effect (App.tsx) already calls `resetScrub()`; it also clears `isDismissingHint`, cancelling the loop rather than animating against an unmounted overlay. |
| Unmount mid-return | `cancelAnimationFrame` in effect cleanup. |
| Double-click "Got it" | `onComplete` fires once. The state writes are naturally idempotent (`markScrubHintSeen` is a repeat write; `setIsDismissingScrubHint(true)` doesn't change `active`, so the animation never restarts) — but analytics is **not** self-idempotent, so `handleDismissScrubHint` early-returns while a dismissal is in flight. `.tooltipLeaving` also sets `pointer-events: none`, since `opacity: 0` alone leaves the button hit-testable. |

## Testing

TDD throughout — failing test first, then implementation.

**`useScrubHintReturn.test.ts`**
- Eases from the start offset toward 0 (intermediate values bounded, strictly
  approaching 0).
- Final value is exactly 0.
- `onComplete` fires exactly once, only after the full duration.
- No `setOffsetMs` calls while `active` is false.
- Cancels on unmount — no calls after teardown.
- Reduced motion: `onComplete` immediately, no animation frames.

**`App.test.tsx`**
- "Got it" does not hide the hint on the same tick.
- After the animation completes, the hint is gone and the offset is 0.
- `markScrubHintSeen` persists at click time, not at completion (assert
  `localStorage` immediately after the click, before advancing timers).

**`ScrubHint.test.tsx`**
- Tooltip carries the leaving class only while `isDismissing` is true.

Existing coverage in `WorldClock.test.tsx` and `useScrubHintDemo.test.ts` must
stay green; the demo hook's own behavior is unchanged apart from the extracted
easing import.

## Out of scope

- Making the return interruptible by a real drag.
- Reusing the return animation for the existing `onBackToNow` / "Back to now"
  affordance, which also jumps. Plausible follow-up, deliberately not bundled.
