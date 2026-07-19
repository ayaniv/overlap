# First-time scrub hint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a first-time visitor a demo of dragging the clock ring to preview a time — an animated hand plus the real clock actually sweeping — dismissed permanently via a "Got it" button, and never shown at all to an untouched ambient/kiosk display.

**Architecture:** Two new hooks (`useHasBeenActive`, `useScrubHintDemo`) plus a tiny localStorage helper (`scrubHint.ts`) are wired into `App.tsx`, which already owns the real scrub state (`useRingScrub`). The demo drives `useRingScrub`'s existing `setOffsetMs` directly — reusing the real rendering path in `WorldClock.tsx` — rather than faking a parallel visual. A new `ScrubHint` component (hand + text + button) renders inside `WorldClock`'s `.clockContainer`, gated entirely by props `App.tsx` computes.

**Tech Stack:** React 19, TypeScript, Vitest + @testing-library/react, plain CSS Modules (no new dependencies).

## Global Constraints

- No new npm dependencies (plain emoji hand, no SVG/animation library).
- Copy is exact, verbatim: hint text is `"Find the right time to schedule a meeting"`, button label is `"Got it"`.
- localStorage key follows the existing `overlap:<feature>:v1` convention (`googleCalendar.ts`): use `overlap:scrub-hint-seen:v1`.
- Every localStorage read/write goes through a try/catch helper function — never a raw `window.localStorage` call at the point of use (mirrors `googleCalendar.ts`).
- Respect `prefers-reduced-motion: reduce` (mirrors `useSweepAngle.ts`'s `matchMedia` check) — the demo loop must not run at all when set.
- Run `npm run build`, `npm run lint`, and `npm test` under Node 24.x (the repo's declared engine; a Node 26 environment previously produced 52 unrelated `googleCalendar.test.ts` jsdom/localStorage failures not present under Node 24 — verify with `node --version` first, or prefix commands with `PATH="/opt/homebrew/opt/node@24/bin:$PATH"` if the default `node` resolves to a different major version).
- Every new/modified test file must pass with zero regressions in the existing suite (currently 331 tests passing on `main`).

## Deviation from the approved spec (flagged for visibility)

The spec (`docs/superpowers/specs/2026-07-15-scrub-hint-demo-design.md`) sketched `useHasBeenActive` as sharing `useIsIdle`'s `ACTIVITY_EVENTS` list (`pointermove`, `pointerdown`, `keydown`, `touchstart`). While writing this plan, tracing `App.test.tsx`'s existing `scrubForward` helper (focuses the slider, presses `ArrowUp`) surfaced a real bug that sharing `keydown` would cause: a keyboard-only user's very first `ArrowUp` press on the clock's slider would simultaneously (a) perform a real scrub via `useRingScrub`'s own `onKeyDown`, which only exists because `scrubBind` is currently attached, and (b) flip `hasBeenActive` true via the same bubbling `keydown` — and on the very next render, the hint could activate and rip `scrubBind` away, interrupting the user's own already-successful discovery of the gesture. **Fix:** `useHasBeenActive` tracks only `pointermove`/`pointerdown`/`touchstart` (never `keydown`) — see Task 1's comment for the full reasoning. `scrubHintActive` in `App.tsx` also adds `&& !isScrubbing` as a synchronous, same-render guard against the equivalent pointer-drag race. Both are covered by tests in Tasks 1 and 6.

---

### Task 1: `useHasBeenActive` hook

**Files:**
- Create: `src/hooks/useHasBeenActive.ts`
- Test: `src/hooks/useHasBeenActive.test.ts`

**Interfaces:**
- Produces: `useHasBeenActive(): boolean` — starts `false`, latches permanently `true` on the first `pointermove`/`pointerdown`/`touchstart` anywhere on `window`, never resets. Consumed by `App.tsx` in Task 6.

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/useHasBeenActive.test.ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHasBeenActive } from './useHasBeenActive';

describe('useHasBeenActive', () => {
  it('is false immediately after mount', () => {
    const { result } = renderHook(() => useHasBeenActive());
    expect(result.current).toBe(false);
  });

  it('flips to true after a pointermove', () => {
    const { result } = renderHook(() => useHasBeenActive());
    act(() => window.dispatchEvent(new Event('pointermove')));
    expect(result.current).toBe(true);
  });

  it('flips to true after a pointerdown', () => {
    const { result } = renderHook(() => useHasBeenActive());
    act(() => window.dispatchEvent(new Event('pointerdown')));
    expect(result.current).toBe(true);
  });

  it('flips to true after a touchstart', () => {
    const { result } = renderHook(() => useHasBeenActive());
    act(() => window.dispatchEvent(new Event('touchstart')));
    expect(result.current).toBe(true);
  });

  it('never flips true from a keydown alone', () => {
    const { result } = renderHook(() => useHasBeenActive());
    act(() => window.dispatchEvent(new Event('keydown')));
    expect(result.current).toBe(false);
  });

  it('stays true after latching, with no further activity', () => {
    const { result } = renderHook(() => useHasBeenActive());
    act(() => window.dispatchEvent(new Event('pointerdown')));
    expect(result.current).toBe(true);
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useHasBeenActive.test.ts`
Expected: FAIL — `Failed to resolve import "./useHasBeenActive"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/hooks/useHasBeenActive.ts
import { useEffect, useState } from 'react';

// pointerdown/pointermove/touchstart only — deliberately excludes keydown.
// keydown is how useRingScrub's own arrow-key scrub works (bound directly on
// the clock's slider element), so counting it here would flip this hook true
// from the exact same keystroke that IS the user successfully discovering the
// scrub gesture on their own — right in the middle of it. Pointer/touch
// activity anywhere else on the page is a safe, unrelated "someone's here"
// signal that can't itself be mistaken for operating the ring.
const PRESENCE_EVENTS = ['pointermove', 'pointerdown', 'touchstart'] as const;

// one-shot latch: false until the first real pointer/touch activity anywhere
// on the page, then permanently true — keeps onboarding UI off an
// ambient/kiosk display that's never actually touched, even briefly on page
// load (unlike useIsIdle, which starts "not idle" and only reacts after a
// timeout with no activity yet).
export function useHasBeenActive(): boolean {
  const [hasBeenActive, setHasBeenActive] = useState(false);

  useEffect(() => {
    if (hasBeenActive) return;

    const handleActivity = () => setHasBeenActive(true);
    for (const eventName of PRESENCE_EVENTS) {
      window.addEventListener(eventName, handleActivity);
    }
    return () => {
      for (const eventName of PRESENCE_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
    };
  }, [hasBeenActive]);

  return hasBeenActive;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useHasBeenActive.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useHasBeenActive.ts src/hooks/useHasBeenActive.test.ts
git commit -m "feat: add useHasBeenActive hook for first-time-presence detection"
```

---

### Task 2: `useScrubHintDemo` hook

**Files:**
- Create: `src/clock/useScrubHintDemo.ts`
- Test: `src/clock/useScrubHintDemo.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `useScrubHintDemo(params: { active: boolean; setOffsetMs: (ms: number) => void }): void`, and exported constants `SCRUB_HINT_AMPLITUDE_MS` (= `90 * 60_000`) and `SCRUB_HINT_PERIOD_MS` (= `2_500`). Consumed by `App.tsx` in Task 6 (`setOffsetMs` passed in is `useRingScrub`'s existing `setOffsetMs`) and by `ScrubHint` indirectly (Task 4 reads the resulting `offsetMs` via the `previewOffsetMs` prop already flowing through `WorldClock`, not from this hook directly).

- [ ] **Step 1: Write the failing test**

```ts
// src/clock/useScrubHintDemo.test.ts
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCRUB_HINT_AMPLITUDE_MS, useScrubHintDemo } from './useScrubHintDemo';

function stubMatchMedia(reducedMotion: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? reducedMotion : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useScrubHintDemo', () => {
  it('calls setOffsetMs with an oscillating value while active', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const setOffsetMs = vi.fn();
    renderHook(() => useScrubHintDemo({ active: true, setOffsetMs }));

    vi.advanceTimersByTime(700);

    expect(setOffsetMs).toHaveBeenCalled();
    const values = setOffsetMs.mock.calls.map((call) => call[0] as number);
    expect(values.some((v) => Math.abs(v) > SCRUB_HINT_AMPLITUDE_MS * 0.5)).toBe(true);
    expect(values.every((v) => Math.abs(v) <= SCRUB_HINT_AMPLITUDE_MS + 1)).toBe(true);
  });

  it('stops calling setOffsetMs once active becomes false', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const setOffsetMs = vi.fn();
    const { rerender } = renderHook(({ active }) => useScrubHintDemo({ active, setOffsetMs }), {
      initialProps: { active: true },
    });

    vi.advanceTimersByTime(100);
    rerender({ active: false });
    setOffsetMs.mockClear();

    vi.advanceTimersByTime(1000);

    expect(setOffsetMs).not.toHaveBeenCalled();
  });

  it('never calls setOffsetMs when prefers-reduced-motion is set', () => {
    stubMatchMedia(true);
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const setOffsetMs = vi.fn();
    renderHook(() => useScrubHintDemo({ active: true, setOffsetMs }));

    vi.advanceTimersByTime(2000);

    expect(setOffsetMs).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/clock/useScrubHintDemo.test.ts`
Expected: FAIL — `Failed to resolve import "./useScrubHintDemo"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/clock/useScrubHintDemo.ts
import { useEffect } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
export const SCRUB_HINT_AMPLITUDE_MS = 90 * 60_000; // +/-90 minutes
export const SCRUB_HINT_PERIOD_MS = 2_500; // one full back-and-forth sweep

export type UseScrubHintDemoParams = {
  active: boolean;
  setOffsetMs: (ms: number) => void;
};

// drives useRingScrub's real setOffsetMs in a smooth sine sweep while
// `active`, so the hint's demo animates the actual clock rendering (rings,
// center time, meeting dots) rather than a decorative copy of it. Skips
// entirely under prefers-reduced-motion: reduce, matching useSweepAngle.ts.
export function useScrubHintDemo({ active, setOffsetMs }: UseScrubHintDemoParams): void {
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return;

    let frameId: number;
    const startTime = Date.now();
    const tick = () => {
      const elapsedMs = Date.now() - startTime;
      const phase = (elapsedMs / SCRUB_HINT_PERIOD_MS) * 2 * Math.PI;
      setOffsetMs(SCRUB_HINT_AMPLITUDE_MS * Math.sin(phase));
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [active, setOffsetMs]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/clock/useScrubHintDemo.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/clock/useScrubHintDemo.ts src/clock/useScrubHintDemo.test.ts
git commit -m "feat: add useScrubHintDemo hook driving the real scrub offset"
```

---

### Task 3: `scrubHint.ts` persistence helper

**Files:**
- Create: `src/clock/scrubHint.ts`
- Test: `src/clock/scrubHint.test.ts`

**Interfaces:**
- Produces: `hasSeenScrubHint(): boolean`, `markScrubHintSeen(): void`, `SCRUB_HINT_SEEN_STORAGE_KEY` (string constant, exported for tests). Consumed by `App.tsx` in Task 6.

- [ ] **Step 1: Write the failing test**

```ts
// src/clock/scrubHint.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasSeenScrubHint, markScrubHintSeen, SCRUB_HINT_SEEN_STORAGE_KEY } from './scrubHint';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('hasSeenScrubHint / markScrubHintSeen', () => {
  it('is false when nothing has been persisted', () => {
    expect(hasSeenScrubHint()).toBe(false);
  });

  it('is true after markScrubHintSeen', () => {
    markScrubHintSeen();
    expect(hasSeenScrubHint()).toBe(true);
  });

  it('persists under the documented storage key', () => {
    markScrubHintSeen();
    expect(window.localStorage.getItem(SCRUB_HINT_SEEN_STORAGE_KEY)).toBe('true');
  });

  it('read failures are caught and default to false', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(hasSeenScrubHint()).toBe(false);
  });

  it('write failures are caught without throwing', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => markScrubHintSeen()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/clock/scrubHint.test.ts`
Expected: FAIL — `Failed to resolve import "./scrubHint"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/clock/scrubHint.ts
export const SCRUB_HINT_SEEN_STORAGE_KEY = 'overlap:scrub-hint-seen:v1';

export function hasSeenScrubHint(): boolean {
  try {
    return window.localStorage.getItem(SCRUB_HINT_SEEN_STORAGE_KEY) === 'true';
  } catch (err) {
    console.error('overlap: failed to read scrub-hint-seen state', err);
    return false;
  }
}

export function markScrubHintSeen(): void {
  try {
    window.localStorage.setItem(SCRUB_HINT_SEEN_STORAGE_KEY, 'true');
  } catch (err) {
    console.error('overlap: failed to persist scrub-hint-seen state', err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/clock/scrubHint.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/clock/scrubHint.ts src/clock/scrubHint.test.ts
git commit -m "feat: add scrubHint localStorage persistence helper"
```

---

### Task 4: `ScrubHint` component

**Files:**
- Create: `src/clock/ScrubHint.tsx`
- Create: `src/clock/ScrubHint.module.css`
- Test: `src/clock/ScrubHint.test.tsx`

**Interfaces:**
- Consumes: `DEGREES_PER_HOUR`, `MS_PER_HOUR`, `pointOnCircle`, `sweepHandOuterRadius` from `./geometry` (all already exported, unchanged).
- Produces: `ScrubHint(props: { offsetMs: number; totalRings: number; onDismiss: () => void }): JSX.Element`. Consumed by `WorldClock.tsx` in Task 5.

- [ ] **Step 1: Write the failing test**

```tsx
// src/clock/ScrubHint.test.tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrubHint } from './ScrubHint';

afterEach(() => {
  cleanup();
});

describe('ScrubHint', () => {
  it('renders the hand, the hint text, and a Got it button', () => {
    render(<ScrubHint offsetMs={0} totalRings={2} onDismiss={vi.fn()} />);

    expect(screen.getByText('👆')).toBeTruthy();
    expect(screen.getByText('Find the right time to schedule a meeting')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Got it' })).toBeTruthy();
  });

  it('calls onDismiss when Got it is clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<ScrubHint offsetMs={0} totalRings={2} onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: 'Got it' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/clock/ScrubHint.test.tsx`
Expected: FAIL — `Failed to resolve import "./ScrubHint"`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/clock/ScrubHint.tsx
import { DEGREES_PER_HOUR, MS_PER_HOUR, pointOnCircle, sweepHandOuterRadius } from './geometry';
import styles from './ScrubHint.module.css';

export type ScrubHintProps = {
  offsetMs: number;
  totalRings: number;
  onDismiss: () => void;
};

const HINT_TEXT = 'Find the right time to schedule a meeting';

// first-time-visitor hint: overlays the clock face with an animated hand
// tracking the same offsetMs the real ring preview uses (driven by
// useScrubHintDemo via App.tsx), so the demo shows the actual clock being
// scrubbed rather than a decorative copy. The caller (WorldClock.tsx)
// decides whether to mount this at all — it always renders its markup
// unconditionally, since "not shown" must mean "not in the DOM."
export function ScrubHint({ offsetMs, totalRings, onDismiss }: ScrubHintProps) {
  const angleDeg = (offsetMs / MS_PER_HOUR) * DEGREES_PER_HOUR;
  const handPoint = pointOnCircle(sweepHandOuterRadius(totalRings), angleDeg);

  return (
    <div className={styles.overlay}>
      <span
        className={styles.hand}
        style={{ left: `${handPoint.x / 10}%`, top: `${handPoint.y / 10}%` }}
        aria-hidden="true"
      >
        👆
      </span>
      <p className={styles.text}>{HINT_TEXT}</p>
      <button type="button" className={styles.button} onClick={onDismiss}>
        Got it
      </button>
    </div>
  );
}
```

```css
/* src/clock/ScrubHint.module.css */
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  border-radius: 50%;
  background: rgba(10, 11, 15, 0.55);
}

.hand {
  position: absolute;
  transform: translate(-50%, -50%);
  font-size: 40px;
  line-height: 1;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
}

.text {
  max-width: 220px;
  margin: 0;
  padding: 0 16px;
  text-align: center;
  color: #f5f6f8;
  font-family: 'Space Grotesk', -apple-system, sans-serif;
  font-size: 15px;
  font-weight: 500;
  line-height: 1.4;
}

.button {
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid #3a3e46;
  background: rgba(20, 22, 29, 0.6);
  color: #c4c8cf;
  font-family: 'Space Grotesk', -apple-system, sans-serif;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.2px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.button:hover,
.button:focus-visible {
  border-color: #565b64;
  color: #f5f6f8;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/clock/ScrubHint.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/clock/ScrubHint.tsx src/clock/ScrubHint.module.css src/clock/ScrubHint.test.tsx
git commit -m "feat: add ScrubHint overlay component"
```

---

### Task 5: Wire `ScrubHint` and `isIdle` into `WorldClock.tsx`

**Files:**
- Modify: `src/clock/WorldClock.tsx:26` (remove `useIsIdle` import), `:60-100` (props type), `:102-129` (destructuring), `:142-143` (drop internal hook call), `:260` (`isScrubActionBarVisible`), `:471-476` (render `ScrubHint`)
- Modify: `src/clock/WorldClock.test.tsx:8` (drop unused import), `:536-622` (rewrite the "ambient idle mode" describe block), add a new "WorldClock scrub hint" describe block

**Interfaces:**
- Consumes: `ScrubHint` from `./ScrubHint` (Task 4).
- Produces: `WorldClockProps` gains `isIdle?: boolean`, `showScrubHint?: boolean`, `onDismissScrubHint?: () => void` (all optional, defaulting to `false`/`undefined`). Consumed by `App.tsx` in Task 6. `previewOffsetMs` and `totalRings` already existed and are reused as-is (no new prop needed for either).

- [ ] **Step 1: Write the failing tests**

In `src/clock/WorldClock.test.tsx`, replace the import line at the top:

```ts
// before (line 8):
import { DEFAULT_IDLE_TIMEOUT_MS } from '../hooks/useIsIdle';
// after: delete this line entirely — no longer used.
```

Replace the entire `describe('WorldClock ambient idle mode', ...)` block (currently lines 536-622) with:

```tsx
describe('WorldClock ambient idle mode', () => {
  it('marks the stage data-chrome-hidden when isIdle is true, in view mode', () => {
    const { container, rerender } = render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        onUpdateLocation={vi.fn()}
        onSetHome={vi.fn()}
        isIdle={false}
      />,
    );
    const stage = container.querySelector('section');
    expect(stage?.hasAttribute('data-chrome-hidden')).toBe(false);

    rerender(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        onUpdateLocation={vi.fn()}
        onSetHome={vi.fn()}
        isIdle={true}
      />,
    );

    expect(stage?.hasAttribute('data-chrome-hidden')).toBe(true);
  });

  it('does not mark data-chrome-hidden when isIdle is true but a panel is open (mode !== view)', () => {
    const { container } = render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[]}
        mode="edit"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        onUpdateLocation={vi.fn()}
        onSetHome={vi.fn()}
        isIdle={true}
      />,
    );

    const stage = container.querySelector('section');
    expect(stage?.hasAttribute('data-chrome-hidden')).toBe(false);
  });
});

describe('WorldClock scrub hint', () => {
  it('renders the scrub hint overlay when showScrubHint is true', () => {
    render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        onUpdateLocation={vi.fn()}
        onSetHome={vi.fn()}
        showScrubHint={true}
        onDismissScrubHint={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Got it' })).toBeTruthy();
  });

  it('does not render the scrub hint overlay by default', () => {
    render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        onUpdateLocation={vi.fn()}
        onSetHome={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
  });

  it('calls onDismissScrubHint when Got it is clicked', async () => {
    const user = userEvent.setup();
    const onDismissScrubHint = vi.fn();
    render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        onUpdateLocation={vi.fn()}
        onSetHome={vi.fn()}
        showScrubHint={true}
        onDismissScrubHint={onDismissScrubHint}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Got it' }));

    expect(onDismissScrubHint).toHaveBeenCalledTimes(1);
  });

  it('hides the scrub action bar even with a nonzero previewOffsetMs while the hint is showing', () => {
    render(
      <WorldClock
        now={NOW}
        home={HOME}
        rings={[SF]}
        meetings={[]}
        mode="view"
        onSetMode={vi.fn()}
        isMenuExpanded={false}
        onMenuExpandedChange={vi.fn()}
        onShare={vi.fn()}
        onRemoveLocation={vi.fn()}
        onReorder={vi.fn()}
        onUpdateLocation={vi.fn()}
        onSetHome={vi.fn()}
        previewOffsetMs={60 * 60_000}
        showScrubHint={true}
        onDismissScrubHint={vi.fn()}
      />,
    );

    expect(screen.queryByText('Schedule')).toBeNull();
    expect(screen.queryByText('Cancel')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/clock/WorldClock.test.tsx`
Expected: FAIL — the two rewritten idle tests fail because `WorldClock` doesn't yet accept an `isIdle` prop (it still calls `useIsIdle()` internally, ignoring the prop / TypeScript error on the unrecognized prop), and the four new "scrub hint" tests fail because `showScrubHint`/`onDismissScrubHint` don't exist yet and no "Got it" button is ever rendered.

- [ ] **Step 3: Write the implementation**

In `src/clock/WorldClock.tsx`:

Remove line 26 (`import { useIsIdle } from '../hooks/useIsIdle';`) and add:

```ts
import { ScrubHint } from './ScrubHint';
```

(placed alphabetically alongside the other same-directory imports, e.g. right before or after the existing `import { Toast } from './Toast';`)

In `WorldClockProps` (after the existing `isPortrait?: boolean;` field, around line 99), add:

```ts
  // ambient "wall display" idle state — now owned by App.tsx (hoisted so both
  // the chrome-fade behavior here and the scrub-hint gating in App.tsx share
  // one idle-timer instance instead of two independent listener sets)
  isIdle?: boolean;
  // first-time scrub-hint overlay (see ScrubHint.tsx); App.tsx computes the
  // full "should this actually be visible right now" gate and passes the
  // result straight through here
  showScrubHint?: boolean;
  onDismissScrubHint?: () => void;
```

In the destructured parameters (after `isPortrait = false,` around line 128), add:

```ts
  isIdle = false,
  showScrubHint = false,
  onDismissScrubHint,
```

Replace (around lines 136-143):

```ts
  // ambient "wall display" mode: fades the header copy, footer status line, and
  // ControlCluster after a stretch of no touch/keystroke/pointer activity, so a
  // clock left running on a wall reads as a clean ambient display rather than an
  // app waiting for input. Only while `mode === 'view'` — fading the chrome out
  // from under an open Config/Schedule panel would strand it with no visible way
  // to close.
  const isIdle = useIsIdle();
  const isChromeHidden = isIdle && mode === 'view';
```

with:

```ts
  // ambient "wall display" mode: fades the header copy, footer status line, and
  // ControlCluster after a stretch of no touch/keystroke/pointer activity, so a
  // clock left running on a wall reads as a clean ambient display rather than an
  // app waiting for input. Only while `mode === 'view'` — fading the chrome out
  // from under an open Config/Schedule panel would strand it with no visible way
  // to close. `isIdle` itself now comes from App.tsx (see WorldClockProps).
  const isChromeHidden = isIdle && mode === 'view';
```

Replace (around line 260):

```ts
  const isScrubActionBarVisible = mode === 'view' && previewOffsetMs !== 0;
```

with:

```ts
  // suppressed while the scrub hint is showing — its demo animation also
  // drives a nonzero previewOffsetMs, and the real Cancel/Schedule/Remove
  // actions must not appear (or be clickable) over a preview the user didn't
  // actually choose
  const isScrubActionBarVisible = mode === 'view' && previewOffsetMs !== 0 && !showScrubHint;
```

Replace (around lines 471-476):

```tsx
        <div className={styles.centerOverlay} aria-hidden="true">
          <div className={styles.centerLocalLabel}>{home.label.toUpperCase()}</div>
          <div className={styles.centerTime}>{homeTime.label}</div>
          <div className={styles.centerDate}>{homeDateLabel}</div>
        </div>
      </div>
```

with:

```tsx
        <div className={styles.centerOverlay} aria-hidden="true">
          <div className={styles.centerLocalLabel}>{home.label.toUpperCase()}</div>
          <div className={styles.centerTime}>{homeTime.label}</div>
          <div className={styles.centerDate}>{homeDateLabel}</div>
        </div>

        {showScrubHint && (
          <ScrubHint offsetMs={previewOffsetMs} totalRings={totalRings} onDismiss={() => onDismissScrubHint?.()} />
        )}
      </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/clock/WorldClock.test.tsx`
Expected: PASS (all tests in the file, including the 2 rewritten idle tests and 4 new scrub-hint tests)

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — no other test file references `useIsIdle` inside `WorldClock.tsx` or relies on its old internal-timer behavior.

- [ ] **Step 6: Commit**

```bash
git add src/clock/WorldClock.tsx src/clock/WorldClock.test.tsx
git commit -m "feat: hoist isIdle out of WorldClock, wire ScrubHint overlay"
```

---

### Task 6: Wire everything into `App.tsx`

**Files:**
- Modify: `src/App.tsx:1-20` (imports), `:40` (destructure `setOffsetMs` from `useRingScrub`), `:42-48` (new state/hooks after `isPortrait`), `:160-189` (props passed to `WorldClock`)
- Modify: `src/App.test.tsx:1-36` (imports + shared `beforeEach`), add a new "App — first-time scrub hint" describe block

**Interfaces:**
- Consumes: `useHasBeenActive` (Task 1), `useScrubHintDemo` (Task 2), `hasSeenScrubHint`/`markScrubHintSeen` (Task 3), `useIsIdle` (existing, now called here instead of in `WorldClock.tsx`), `WorldClockProps`'s new `isIdle`/`showScrubHint`/`onDismissScrubHint` (Task 5).
- Produces: fully wired feature — no further consumers.

- [ ] **Step 1: Write the failing tests**

In `src/App.test.tsx`, add `act` to the existing `@testing-library/react` import and add a `useIsIdle` import:

```ts
// before (line 1):
import { cleanup, render, screen, waitFor } from '@testing-library/react';
// after:
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
```

Add near the other local imports (after the `useClockConfig` import):

```ts
import { DEFAULT_IDLE_TIMEOUT_MS } from './hooks/useIsIdle';
```

Update the shared `beforeEach` (currently):

```ts
beforeEach(() => {
  stubMatchMedia();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});
```

to:

```ts
beforeEach(() => {
  stubMatchMedia();
  window.localStorage.clear();
  // pre-seed "already dismissed" so the ~400 existing assertions in this file
  // (written before this feature existed) keep exercising the app's steady
  // state, not a fresh first-run; the dedicated describe block below removes
  // this key explicitly wherever it wants the first-run scenario instead
  window.localStorage.setItem('overlap:scrub-hint-seen:v1', 'true');
  window.history.replaceState(null, '', '/');
});
```

Add a new describe block anywhere in the file (e.g. at the end):

```tsx
describe('App — first-time scrub hint', () => {
  beforeEach(() => {
    window.localStorage.removeItem('overlap:scrub-hint-seen:v1');
  });

  it('does not show before any real activity has occurred', () => {
    renderApp();
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
  });

  it('shows once real activity occurs, in view mode, not yet dismissed', () => {
    renderApp();
    act(() => window.dispatchEvent(new Event('pointermove')));
    expect(screen.getByRole('button', { name: 'Got it' })).toBeTruthy();
  });

  it('never shows if already marked as seen, even with activity', () => {
    window.localStorage.setItem('overlap:scrub-hint-seen:v1', 'true');
    renderApp();
    act(() => window.dispatchEvent(new Event('pointermove')));
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
  });

  it('is removed from the DOM (not just hidden) and never reappears after Got it is clicked', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp();
    act(() => window.dispatchEvent(new Event('pointermove')));
    expect(screen.getByRole('button', { name: 'Got it' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
    expect(window.localStorage.getItem('overlap:scrub-hint-seen:v1')).toBe('true');

    unmount();
    renderApp();
    act(() => window.dispatchEvent(new Event('pointermove')));
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
  });

  it('hides when the screen goes idle (removed from the DOM, not just paused)', () => {
    renderApp();
    act(() => window.dispatchEvent(new Event('pointermove')));
    expect(screen.getByRole('button', { name: 'Got it' })).toBeTruthy();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    act(() => vi.advanceTimersByTime(DEFAULT_IDLE_TIMEOUT_MS));
    vi.useRealTimers();

    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — the new "first-time scrub hint" tests fail because `App.tsx` never renders a "Got it" button yet; other pre-existing tests in the file should still pass (the pre-seeded localStorage key is inert until `App.tsx` actually reads it).

- [ ] **Step 3: Write the implementation**

In `src/App.tsx`, update the imports:

```ts
// before:
import { useCallback, useMemo, useRef, useState } from 'react';
import { useAnalytics } from './analytics/AnalyticsProvider';
import { useLogger } from './logger/LoggerProvider';
import { AddLocationForm } from './clock/AddLocationForm';
import {
  DEFAULT_MEETING_DURATION_MINUTES,
  deleteMeetingFromGoogleCalendar,
  isGoogleCalendarConnected,
  scheduleMeetingOnGoogleCalendar,
} from './clock/googleCalendar';
import { buildMeeting, buildOverlapMeetingTitle, findMeetingAtInstant } from './clock/meetingForm';
import { shareLink } from './clock/share';
import type { ShareOutcome } from './clock/share';
import { useRingScrub } from './clock/useRingScrub';
import { WorldClock } from './clock/WorldClock';
import type { Mode } from './clock/types';
import { useClockConfig } from './hooks/useClockConfig';
import { useIsPortrait } from './hooks/useIsPortrait';
import { useNow } from './hooks/useNow';
import { useToast } from './hooks/useToast';

// after:
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnalytics } from './analytics/AnalyticsProvider';
import { useLogger } from './logger/LoggerProvider';
import { AddLocationForm } from './clock/AddLocationForm';
import {
  DEFAULT_MEETING_DURATION_MINUTES,
  deleteMeetingFromGoogleCalendar,
  isGoogleCalendarConnected,
  scheduleMeetingOnGoogleCalendar,
} from './clock/googleCalendar';
import { buildMeeting, buildOverlapMeetingTitle, findMeetingAtInstant } from './clock/meetingForm';
import { hasSeenScrubHint, markScrubHintSeen } from './clock/scrubHint';
import { shareLink } from './clock/share';
import type { ShareOutcome } from './clock/share';
import { useRingScrub } from './clock/useRingScrub';
import { useScrubHintDemo } from './clock/useScrubHintDemo';
import { WorldClock } from './clock/WorldClock';
import type { Mode } from './clock/types';
import { useClockConfig } from './hooks/useClockConfig';
import { useHasBeenActive } from './hooks/useHasBeenActive';
import { useIsIdle } from './hooks/useIsIdle';
import { useIsPortrait } from './hooks/useIsPortrait';
import { useNow } from './hooks/useNow';
import { useToast } from './hooks/useToast';
```

Replace the `useRingScrub()` destructuring (currently):

```ts
  const { previewOffsetMs: scrubOffsetMs, isDragging: isScrubbing, reset: resetScrub, bind: scrubBind } = useRingScrub();
```

with:

```ts
  const {
    previewOffsetMs: scrubOffsetMs,
    isDragging: isScrubbing,
    reset: resetScrub,
    setOffsetMs: scrubSetOffsetMs,
    bind: scrubBind,
  } = useRingScrub();
```

After `const isPortrait = useIsPortrait();`, add:

```ts
  const isIdle = useIsIdle();
  const hasBeenActive = useHasBeenActive();
  const [showScrubHint, setShowScrubHint] = useState(() => !hasSeenScrubHint());
  // full gate for "is the hint actually visible/animating right now" — the
  // narrower `showScrubHint` state only tracks permanent dismissal.
  // `!isScrubbing` closes a same-render race: if the very first activity
  // event that flips `hasBeenActive` is itself a real pointerdown on the
  // ring, useRingScrub's onPointerDown already set isScrubbing true in that
  // same event/render, so this stays false instead of transiently yanking
  // scrubBind out from under an in-progress real drag (see the plan's
  // "Deviation from the approved spec" note for the full reasoning).
  const scrubHintActive = showScrubHint && mode === 'view' && hasBeenActive && !isIdle && !isScrubbing;
  useScrubHintDemo({ active: scrubHintActive, setOffsetMs: scrubSetOffsetMs });

  // falls back to real "now" if idle kicks in while the hint would otherwise
  // be animating, so an unattended ambient display never freezes mid-sweep;
  // isIdle can't become true while a real drag is in progress (any pointer
  // activity continuously resets useIsIdle's own timer), so this never fires
  // mid-real-scrub
  const wasIdleRef = useRef(isIdle);
  useEffect(() => {
    const wasIdle = wasIdleRef.current;
    wasIdleRef.current = isIdle;
    if (!wasIdle && isIdle && showScrubHint) {
      resetScrub();
    }
  }, [isIdle, showScrubHint, resetScrub]);

  const handleDismissScrubHint = useCallback(() => {
    markScrubHintSeen();
    setShowScrubHint(false);
    resetScrub();
    analytics.trackEvent('scrub_hint_dismissed');
  }, [resetScrub, analytics]);
```

Update the `<WorldClock ... />` JSX (currently ending):

```tsx
      isRemovingMeeting={isRemovingMeeting}
      isPortrait={isPortrait}
    />
```

to:

```tsx
      isRemovingMeeting={isRemovingMeeting}
      isPortrait={isPortrait}
      isIdle={isIdle}
      showScrubHint={scrubHintActive}
      onDismissScrubHint={handleDismissScrubHint}
    />
```

And update the existing `scrubBind` prop on the same `<WorldClock>` element (currently):

```tsx
      scrubBind={canScrub ? scrubBind : undefined}
```

to:

```tsx
      scrubBind={canScrub && !scrubHintActive ? scrubBind : undefined}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (all tests in the file, including the 5 new "first-time scrub hint" tests)

- [ ] **Step 5: Run the full test suite, build, and lint**

Run: `npx vitest run`
Expected: PASS — no regressions anywhere (331 previously-passing tests + all new tests from Tasks 1-6).

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

Run: `npm run lint`
Expected: no new warnings/errors (pre-existing `AnalyticsProvider.tsx`/`LoggerProvider.tsx` fast-refresh warnings are unrelated and expected to remain).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: wire the first-time scrub hint into App"
```

## Self-Review

**Spec coverage:** every "Decisions locked during brainstorming" bullet in the spec maps to a task — explicit-only dismissal (Task 6's `handleDismissScrubHint`), blocked real dragging (Task 6's `scrubBind={canScrub && !scrubHintActive ? ... }`), real-clock-driven demo (Task 2 + Task 5's `ScrubHint` reading `previewOffsetMs`), looping until dismissed (Task 2's continuous rAF loop while `active`), emoji hand (Task 4), presence + idle gating (Tasks 1, 5, 6), hoisted `useIsIdle` (Task 5/6), separate `useHasBeenActive` (Task 1), `googleCalendar.ts`-style persistence (Task 3), reduced-motion (Task 2). The "Out of scope" section's three items are respected (no touch/mouse copy branching, no `useRingScrub.ts` changes, no page-wide scrim — `ScrubHint`'s `.overlay` only covers the clock circle).

**Placeholder scan:** no TBD/TODO; every step has complete, runnable code.

**Type consistency:** `useScrubHintDemo({ active, setOffsetMs })` (Task 2) matches its Task 6 call site exactly. `ScrubHint({ offsetMs, totalRings, onDismiss })` (Task 4) matches its Task 5 render call exactly. `hasSeenScrubHint`/`markScrubHintSeen` (Task 3) match their Task 6 usages exactly. `WorldClockProps`'s `isIdle?/showScrubHint?/onDismissScrubHint?` (Task 5) match the props Task 6 passes.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-15-scrub-hint-demo.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
