# "Find time to meet" button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Find Time" button that searches across the clock's existing working-hours arcs for the best simultaneous meeting time (falling back to a small "stretch" tolerance when no perfect overlap exists), animates the clock to that time reusing the existing scrub-preview mechanics, and lets the developer refine the result by checking/unchecking individual cities.

**Architecture:** A new pure module (`findMeetingTime.ts`) implements a sweep-line max-overlap search over per-city "hours from now" working-hours windows, with a two-pass strict-then-stretch fallback. A new small hook (`useFindMeetingTimeSweep.ts`), modeled directly on the existing `useScrubHintReturn.ts`, eases `previewOffsetMs` to the found offset. `ControlCluster.tsx` gains a "Find Time" button in two layouts (always-visible primary in view mode, secondary inside the existing Cancel/Schedule bar). `WorldClock.tsx` renders a 3-state ring arc (in-hours/stretched/out) and a per-ring checkbox overlay while a find result is active. `App.tsx` owns all the new state and wires it together, piggybacking cleanup on the existing `resetScrub()` call sites.

**Tech Stack:** React 19, TypeScript, Vitest + @testing-library/react, plain CSS Modules (no new dependencies).

## Global Constraints

- No new npm dependencies.
- Copy is exact, verbatim: button label is `"Find Time"`.
- Stretch tolerance is exactly 1 hour (`STRETCH_HOURS = 1`) on each side of a city's normal working hours.
- Landing times are snapped forward to the next 15-minute wall-clock boundary (`QUARTER_HOUR_MS = 15 * 60_000`).
- Every new interactive element gets a `data-testid` per this repo's standing convention — never a text-based selector.
- Run `npm run build`, `npm run lint`, and `npm test` under Node 24.x (a Node 26 environment previously produced unrelated jsdom/localStorage failures — verify with `node --version` first, or prefix commands with `PATH="/opt/homebrew/opt/node@24/bin:$PATH"` if the default `node` resolves to a different major version).
- Every new/modified test file must pass with zero regressions in the existing suite.

---

### Task 1: `findMeetingTime.ts` — per-city working-hours windows

**Files:**
- Create: `src/clock/findMeetingTime.ts`
- Test: `src/clock/findMeetingTime.test.ts`

**Interfaces:**
- Consumes: `getCityTime`, `isWithinWorkingHours` from `./cityTime` (both already exported, unchanged); `Location` from `./types`.
- Produces: exported `CityWindow` type (`{ id: string; startOffsetHours: number; endOffsetHours: number }`), `nextWorkingWindow(now: Date, location: Location): CityWindow`, `widenWindow(window: CityWindow, hours: number): CityWindow`. Consumed by Task 2 (`sweepMaxOverlap`) and Task 3 (`findBestMeetingOffset`) in the same file.

- [ ] **Step 1: Write the failing test**

```ts
// src/clock/findMeetingTime.test.ts
import { describe, expect, it } from 'vitest';
import { nextWorkingWindow, widenWindow } from './findMeetingTime';
import type { Location } from './types';

const NOW = new Date('2026-01-01T15:00:00.000Z');

function makeLocation(overrides: Partial<Location>): Location {
  return { id: 'city', label: 'City', timezoneId: 'UTC', color: '#38BDF8', workStart: 9, workEnd: 17, ...overrides };
}

describe('nextWorkingWindow', () => {
  it('starts at offset 0 when already inside working hours, ending when hours end today', () => {
    // Etc/GMT+3 = UTC-3, so 15:00Z reads as local 12:00 -> inside [9, 17)
    const location = makeLocation({ timezoneId: 'Etc/GMT+3', workStart: 9, workEnd: 17 });
    expect(nextWorkingWindow(NOW, location)).toEqual({ id: 'city', startOffsetHours: 0, endOffsetHours: 5 });
  });

  it('starts in the future when currently outside working hours', () => {
    // Etc/GMT+7 = UTC-7, so 15:00Z reads as local 08:00 -> outside [9, 17)
    const location = makeLocation({ id: 'sf', timezoneId: 'Etc/GMT+7', workStart: 9, workEnd: 17 });
    expect(nextWorkingWindow(NOW, location)).toEqual({ id: 'sf', startOffsetHours: 1, endOffsetHours: 9 });
  });

  it('wraps forward across midnight when the start hour is earlier than the current hour', () => {
    // Etc/GMT-8 = UTC+8, so 15:00Z reads as local 23:00 -> next 9am start is 10h away
    const location = makeLocation({ id: 'tokyo', timezoneId: 'Etc/GMT-8', workStart: 9, workEnd: 18 });
    expect(nextWorkingWindow(NOW, location)).toEqual({ id: 'tokyo', startOffsetHours: 10, endOffsetHours: 19 });
  });
});

describe('widenWindow', () => {
  it('expands both ends by the given hours', () => {
    expect(widenWindow({ id: 'x', startOffsetHours: 5, endOffsetHours: 10 }, 1)).toEqual({
      id: 'x',
      startOffsetHours: 4,
      endOffsetHours: 11,
    });
  });

  it('clamps the start at 0 instead of going negative', () => {
    expect(widenWindow({ id: 'x', startOffsetHours: 0.5, endOffsetHours: 10 }, 1)).toEqual({
      id: 'x',
      startOffsetHours: 0,
      endOffsetHours: 11,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/clock/findMeetingTime.test.ts`
Expected: FAIL — `Failed to resolve import "./findMeetingTime"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/clock/findMeetingTime.ts
import { getCityTime, isWithinWorkingHours } from './cityTime';
import type { Location } from './types';

export type CityWindow = {
  id: string;
  startOffsetHours: number;
  endOffsetHours: number;
};

// hours-from-now interval during which `location` is next inside its normal
// working hours. A city already inside its hours right now gets a window
// starting at 0 (now) rather than "tomorrow" — its current stretch of
// in-hours time is exactly what a meeting right now would land inside of.
export function nextWorkingWindow(now: Date, location: Location): CityWindow {
  const { frac } = getCityTime(now, location.timezoneId);
  const { workStart, workEnd } = location;
  if (isWithinWorkingHours(frac, workStart, workEnd)) {
    return { id: location.id, startOffsetHours: 0, endOffsetHours: workEnd - frac };
  }
  const hoursUntilStart = (((workStart - frac) % 24) + 24) % 24;
  return { id: location.id, startOffsetHours: hoursUntilStart, endOffsetHours: hoursUntilStart + (workEnd - workStart) };
}

// widens a window by `hours` on each side, never letting the start go before
// "now" (offset 0) — a meeting can't be scheduled in the past.
export function widenWindow(window: CityWindow, hours: number): CityWindow {
  return {
    id: window.id,
    startOffsetHours: Math.max(0, window.startOffsetHours - hours),
    endOffsetHours: window.endOffsetHours + hours,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/clock/findMeetingTime.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/clock/findMeetingTime.ts src/clock/findMeetingTime.test.ts
git commit -m "feat: add per-city working-hours window helpers for Find Time"
```

---

### Task 2: `findMeetingTime.ts` — max-overlap sweep

**Files:**
- Modify: `src/clock/findMeetingTime.ts` (append)
- Test: `src/clock/findMeetingTime.test.ts` (append)

**Interfaces:**
- Consumes: `CityWindow` from Task 1.
- Produces: `sweepMaxOverlap(windows: CityWindow[]): { startOffsetHours: number; endOffsetHours: number; count: number }`. Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Append to `src/clock/findMeetingTime.test.ts`:

```ts
import { sweepMaxOverlap } from './findMeetingTime';

describe('sweepMaxOverlap', () => {
  it('finds the earliest point where the most windows overlap', () => {
    const result = sweepMaxOverlap([
      { id: 'a', startOffsetHours: 0, endOffsetHours: 5 },
      { id: 'b', startOffsetHours: 3, endOffsetHours: 8 },
      { id: 'c', startOffsetHours: 20, endOffsetHours: 25 },
    ]);
    expect(result).toEqual({ startOffsetHours: 3, endOffsetHours: 5, count: 2 });
  });

  it('returns count 1 at the earliest window when nothing overlaps', () => {
    const result = sweepMaxOverlap([
      { id: 'a', startOffsetHours: 1, endOffsetHours: 9 },
      { id: 'b', startOffsetHours: 10, endOffsetHours: 19 },
    ]);
    expect(result).toEqual({ startOffsetHours: 1, endOffsetHours: 9, count: 1 });
  });

  it('treats a window ending exactly when another starts as non-overlapping', () => {
    const result = sweepMaxOverlap([
      { id: 'a', startOffsetHours: 0, endOffsetHours: 5 },
      { id: 'b', startOffsetHours: 5, endOffsetHours: 10 },
    ]);
    expect(result.count).toBe(1);
  });

  it('returns count 0 for an empty list of windows', () => {
    expect(sweepMaxOverlap([])).toEqual({ startOffsetHours: 0, endOffsetHours: 0, count: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/clock/findMeetingTime.test.ts`
Expected: FAIL — `sweepMaxOverlap is not exported` / not a function.

- [ ] **Step 3: Write minimal implementation**

Append to `src/clock/findMeetingTime.ts`:

```ts
type SweepEvent = { hours: number; delta: 1 | -1 };

// classic "point of maximum overlap" sweep: +1 at every window's start, -1 at
// every end. Walking the sorted events with a running total finds both how
// many windows are simultaneously active at any point, and the earliest
// point (plus that run's end) where the count is at its max. End events sort
// before start events at an exact tie, matching isWithinWorkingHours' own
// half-open [start, end) convention — a window that ends exactly when
// another starts isn't "active" at that shared instant.
export function sweepMaxOverlap(windows: CityWindow[]): { startOffsetHours: number; endOffsetHours: number; count: number } {
  const events: SweepEvent[] = windows.flatMap((w) => [
    { hours: w.startOffsetHours, delta: 1 as const },
    { hours: w.endOffsetHours, delta: -1 as const },
  ]);
  events.sort((a, b) => a.hours - b.hours || a.delta - b.delta);

  let running = 0;
  let best = { startOffsetHours: 0, endOffsetHours: 0, count: 0 };
  for (let i = 0; i < events.length; i++) {
    running += events[i].delta;
    if (running > best.count) {
      const endOffsetHours = i + 1 < events.length ? events[i + 1].hours : events[i].hours;
      best = { startOffsetHours: events[i].hours, endOffsetHours, count: running };
    }
  }
  return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/clock/findMeetingTime.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/clock/findMeetingTime.ts src/clock/findMeetingTime.test.ts
git commit -m "feat: add max-overlap sweep for Find Time"
```

---

### Task 3: `findMeetingTime.ts` — `findBestMeetingOffset` (integration, stretch fallback, quarter-hour snap, classification)

**Files:**
- Modify: `src/clock/findMeetingTime.ts` (append)
- Test: `src/clock/findMeetingTime.test.ts` (append)

**Interfaces:**
- Consumes: `nextWorkingWindow`, `widenWindow`, `sweepMaxOverlap` from Tasks 1–2; `getCityTime`, `isWithinWorkingHours` from `./cityTime`; `Location` from `./types`.
- Produces: `CityFitStatus = 'in-hours' | 'stretched' | 'out'`, `CityFitResult = { id: string; status: CityFitStatus }`, `FindMeetingTimeResult = { offsetMs: number; perfectCount: number; fitCount: number; totalCount: number; cityResults: CityFitResult[] }`, and `findBestMeetingOffset(now: Date, home: Location, includedRings: Location[]): FindMeetingTimeResult`. `findBestMeetingOffset` and `CityFitStatus`/`FindMeetingTimeResult` are consumed by Task 4 (hook) and Task 7 (`App.tsx`); `CityFitStatus` is also consumed by Task 6 (`WorldClock.tsx`).

- [ ] **Step 1: Write the failing test**

Append to `src/clock/findMeetingTime.test.ts`:

```ts
import { findBestMeetingOffset } from './findMeetingTime';

const HOME: Location = { id: 'home', label: 'Home', timezoneId: 'Etc/GMT+7', color: '#38BDF8', workStart: 9, workEnd: 17 }; // UTC-7 -> local 08:00
const RING: Location = { id: 'ring', label: 'Ring', timezoneId: 'Etc/GMT-8', color: '#FB7185', workStart: 9, workEnd: 18 }; // UTC+8 -> local 23:00

describe('findBestMeetingOffset', () => {
  // also covers the "single remaining ring" case: home + one ring is the
  // full city list here, and the algorithm needs no special-casing for it —
  // the stretch fallback is exactly what makes a fit possible at all
  it('falls back to a stretched fit when no perfect overlap exists between home and a ring', () => {
    const result = findBestMeetingOffset(NOW, HOME, [RING]);

    expect(result.offsetMs).toBe(9 * 60 * 60_000);
    expect(result.perfectCount).toBe(0);
    expect(result.fitCount).toBe(2);
    expect(result.totalCount).toBe(2);
    expect(result.cityResults).toEqual([
      { id: 'home', status: 'stretched' },
      { id: 'ring', status: 'stretched' },
    ]);
  });

  it('returns offset 0 when every city is already in its working hours', () => {
    // Etc/GMT+5 = UTC-5 -> local 10:00 (inside 9-17); Etc/GMT+4 = UTC-4 -> local 11:00 (inside 9-18)
    const homeInHours: Location = { id: 'home', label: 'Home', timezoneId: 'Etc/GMT+5', color: '#38BDF8', workStart: 9, workEnd: 17 };
    const ringInHours: Location = { id: 'ring', label: 'Ring', timezoneId: 'Etc/GMT+4', color: '#FB7185', workStart: 9, workEnd: 18 };

    const result = findBestMeetingOffset(NOW, homeInHours, [ringInHours]);

    expect(result.offsetMs).toBe(0);
    expect(result.perfectCount).toBe(2);
    expect(result.fitCount).toBe(2);
    expect(result.cityResults).toEqual([
      { id: 'home', status: 'in-hours' },
      { id: 'ring', status: 'in-hours' },
    ]);
  });

  it('snaps the landing time forward to the next quarter-hour boundary', () => {
    const alwaysInHours: Location = { id: 'home', label: 'Home', timezoneId: 'UTC', color: '#38BDF8', workStart: 0, workEnd: 24 };
    const notQuiteAligned = new Date('2026-01-01T15:07:00.000Z');

    const result = findBestMeetingOffset(notQuiteAligned, alwaysInHours, []);

    expect(result.offsetMs).toBe(8 * 60_000); // 15:07 -> next boundary 15:15
  });

  it('with no rings at all, is trivially perfect at home\'s own next in-hours moment', () => {
    const result = findBestMeetingOffset(NOW, HOME, []);
    expect(result.totalCount).toBe(1);
    expect(result.perfectCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/clock/findMeetingTime.test.ts`
Expected: FAIL — `findBestMeetingOffset is not exported` / not a function.

- [ ] **Step 3: Write minimal implementation**

Append to `src/clock/findMeetingTime.ts`:

```ts
export type CityFitStatus = 'in-hours' | 'stretched' | 'out';

export type CityFitResult = {
  id: string;
  status: CityFitStatus;
};

export type FindMeetingTimeResult = {
  offsetMs: number;
  perfectCount: number;
  fitCount: number;
  totalCount: number;
  cityResults: CityFitResult[];
};

export const STRETCH_HOURS = 1;
const QUARTER_HOUR_MS = 15 * 60_000;
const MS_PER_HOUR = 3_600_000;

// rounds `window.startOffsetHours` (measured from `now`) forward to the next
// quarter-hour wall-clock boundary. Every real-world UTC offset is itself a
// multiple of 15 minutes, so rounding the instant's raw minute value lands on
// a clean :00/:15/:30/:45 in every city's local clock simultaneously, not
// just one. Falls back to the unsnapped start if snapping would overshoot
// the window it was found in (only possible for a window narrower than 15
// minutes).
function snapForwardToQuarterHour(now: Date, window: { startOffsetHours: number; endOffsetHours: number }): number {
  const candidateMs = now.getTime() + window.startOffsetHours * MS_PER_HOUR;
  const snappedMs = Math.ceil(candidateMs / QUARTER_HOUR_MS) * QUARTER_HOUR_MS;
  const snappedOffsetHours = (snappedMs - now.getTime()) / MS_PER_HOUR;
  return snappedOffsetHours <= window.endOffsetHours ? snappedOffsetHours : window.startOffsetHours;
}

function classifyCity(now: Date, offsetMs: number, location: Location): CityFitStatus {
  const candidate = new Date(now.getTime() + offsetMs);
  const { frac } = getCityTime(candidate, location.timezoneId);
  const { workStart, workEnd } = location;
  if (isWithinWorkingHours(frac, workStart, workEnd)) return 'in-hours';
  if (isWithinWorkingHours(frac, Math.max(0, workStart - STRETCH_HOURS), workEnd + STRETCH_HOURS)) return 'stretched';
  return 'out';
}

// two-pass search: try every included city's strict working-hours window
// first; only if that can't cover every city does a second pass, using each
// city's window widened by STRETCH_HOURS on each side, get a chance to win
// instead (and only if it actually covers more cities than the strict pass
// did — see findMeetingTime-design.md's "Decisions locked" section).
export function findBestMeetingOffset(now: Date, home: Location, includedRings: Location[]): FindMeetingTimeResult {
  const cities = [home, ...includedRings];
  const strictWindows = cities.map((city) => nextWorkingWindow(now, city));

  let winner = sweepMaxOverlap(strictWindows);
  if (winner.count < cities.length) {
    const stretchedWindows = strictWindows.map((w) => widenWindow(w, STRETCH_HOURS));
    const stretchedWinner = sweepMaxOverlap(stretchedWindows);
    if (stretchedWinner.count > winner.count) winner = stretchedWinner;
  }

  const snappedOffsetHours = snapForwardToQuarterHour(now, winner);
  const offsetMs = Math.round(snappedOffsetHours * MS_PER_HOUR);

  const cityResults = cities.map((city) => ({ id: city.id, status: classifyCity(now, offsetMs, city) }));
  const perfectCount = cityResults.filter((c) => c.status === 'in-hours').length;
  const fitCount = cityResults.filter((c) => c.status !== 'out').length;

  return { offsetMs, perfectCount, fitCount, totalCount: cities.length, cityResults };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/clock/findMeetingTime.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — no other file imports `findMeetingTime.ts` yet.

- [ ] **Step 6: Commit**

```bash
git add src/clock/findMeetingTime.ts src/clock/findMeetingTime.test.ts
git commit -m "feat: add findBestMeetingOffset with stretch fallback and quarter-hour snapping"
```

---

### Task 4: `useFindMeetingTimeSweep` hook

**Files:**
- Create: `src/clock/useFindMeetingTimeSweep.ts`
- Test: `src/clock/useFindMeetingTimeSweep.test.ts`

**Interfaces:**
- Consumes: `easedBetween` from `./easing` (already exported, unchanged).
- Produces: `FIND_MEETING_TIME_SWEEP_MS` (= `600`), `useFindMeetingTimeSweep(params: { active: boolean; fromOffsetMs: number; toOffsetMs: number; setOffsetMs: (ms: number) => void; onComplete: () => void }): void`. Consumed by `App.tsx` in Task 7, driving `useRingScrub`'s existing `setOffsetMs`.

- [ ] **Step 1: Write the failing test**

```ts
// src/clock/useFindMeetingTimeSweep.test.ts
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MS_PER_HOUR } from './geometry';
import { FIND_MEETING_TIME_SWEEP_MS, useFindMeetingTimeSweep } from './useFindMeetingTimeSweep';

const TARGET_OFFSET_MS = 9 * MS_PER_HOUR;

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

describe('useFindMeetingTimeSweep', () => {
  it('eases the offset from the start value to exactly the target', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const setOffsetMs = vi.fn();
    renderHook(() =>
      useFindMeetingTimeSweep({ active: true, fromOffsetMs: 0, toOffsetMs: TARGET_OFFSET_MS, setOffsetMs, onComplete: vi.fn() }),
    );

    vi.advanceTimersByTime(FIND_MEETING_TIME_SWEEP_MS + 100);

    const values = setOffsetMs.mock.calls.map((call) => call[0] as number);
    expect(values.at(-1)).toBe(TARGET_OFFSET_MS);
    expect(values.every((v) => v >= 0 && v <= TARGET_OFFSET_MS)).toBe(true);
    expect(values.some((v) => v > 0 && v < TARGET_OFFSET_MS)).toBe(true);
  });

  it('calls onComplete exactly once, only after the full duration has elapsed', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const onComplete = vi.fn();
    renderHook(() =>
      useFindMeetingTimeSweep({ active: true, fromOffsetMs: 0, toOffsetMs: TARGET_OFFSET_MS, setOffsetMs: vi.fn(), onComplete }),
    );

    vi.advanceTimersByTime(FIND_MEETING_TIME_SWEEP_MS - 100);
    expect(onComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(onComplete).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not touch the offset while inactive', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const setOffsetMs = vi.fn();
    const onComplete = vi.fn();
    renderHook(() =>
      useFindMeetingTimeSweep({ active: false, fromOffsetMs: 0, toOffsetMs: TARGET_OFFSET_MS, setOffsetMs, onComplete }),
    );

    vi.advanceTimersByTime(FIND_MEETING_TIME_SWEEP_MS + 500);

    expect(setOffsetMs).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('stops animating when unmounted mid-sweep', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const setOffsetMs = vi.fn();
    const onComplete = vi.fn();
    const { unmount } = renderHook(() =>
      useFindMeetingTimeSweep({ active: true, fromOffsetMs: 0, toOffsetMs: TARGET_OFFSET_MS, setOffsetMs, onComplete }),
    );

    vi.advanceTimersByTime(100);
    unmount();
    setOffsetMs.mockClear();

    vi.advanceTimersByTime(FIND_MEETING_TIME_SWEEP_MS + 500);

    expect(setOffsetMs).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('skips the animation entirely under prefers-reduced-motion, completing immediately at the target', () => {
    stubMatchMedia(true);
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const setOffsetMs = vi.fn();
    const onComplete = vi.fn();
    renderHook(() =>
      useFindMeetingTimeSweep({ active: true, fromOffsetMs: 0, toOffsetMs: TARGET_OFFSET_MS, setOffsetMs, onComplete }),
    );

    expect(setOffsetMs).toHaveBeenCalledWith(TARGET_OFFSET_MS);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/clock/useFindMeetingTimeSweep.test.ts`
Expected: FAIL — `Failed to resolve import "./useFindMeetingTimeSweep"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/clock/useFindMeetingTimeSweep.ts
import { useEffect, useRef } from 'react';
import { easedBetween } from './easing';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
export const FIND_MEETING_TIME_SWEEP_MS = 600;

export type UseFindMeetingTimeSweepParams = {
  active: boolean;
  fromOffsetMs: number;
  toOffsetMs: number;
  setOffsetMs: (ms: number) => void;
  onComplete: () => void;
};

// eases previewOffsetMs from wherever it sits when triggered to an arbitrary
// target — modeled directly on useScrubHintReturn.ts (same easedBetween, same
// duration convention), generalized to any target instead of always 0.
export function useFindMeetingTimeSweep({ active, fromOffsetMs, toOffsetMs, setOffsetMs, onComplete }: UseFindMeetingTimeSweepParams): void {
  const latestFromOffsetMs = useRef(fromOffsetMs);
  latestFromOffsetMs.current = fromOffsetMs;
  const latestToOffsetMs = useRef(toOffsetMs);
  latestToOffsetMs.current = toOffsetMs;
  const latestOnComplete = useRef(onComplete);
  latestOnComplete.current = onComplete;

  useEffect(() => {
    if (!active) return;

    const targetOffsetMs = latestToOffsetMs.current;

    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      setOffsetMs(targetOffsetMs);
      latestOnComplete.current();
      return;
    }

    const startOffsetMs = latestFromOffsetMs.current;
    const startTime = Date.now();
    const tick = () => {
      const elapsedMs = Math.min(Date.now() - startTime, FIND_MEETING_TIME_SWEEP_MS);
      setOffsetMs(easedBetween(startOffsetMs, targetOffsetMs, elapsedMs / FIND_MEETING_TIME_SWEEP_MS));
      if (elapsedMs < FIND_MEETING_TIME_SWEEP_MS) {
        frameId = requestAnimationFrame(tick);
        return;
      }
      latestOnComplete.current();
    };
    let frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [active, setOffsetMs]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/clock/useFindMeetingTimeSweep.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/clock/useFindMeetingTimeSweep.ts src/clock/useFindMeetingTimeSweep.test.ts
git commit -m "feat: add useFindMeetingTimeSweep hook"
```

---

### Task 5: `ControlCluster.tsx` — "Find Time" button (view mode + scrub bar)

**Files:**
- Create: `src/clock/icons/SparkleIcon.tsx`
- Modify: `src/clock/ControlCluster.tsx`
- Modify: `src/clock/ControlCluster.module.css` (append)
- Modify: `src/clock/ControlCluster.test.tsx` (append)

**Interfaces:**
- Consumes: nothing new from earlier tasks (this task is UI-only; wiring to `findMeetingTime.ts`/the hook happens in `App.tsx`, Task 7).
- Produces: `ControlClusterProps` gains `onFindTime?: () => void` (undefined hides the button in both layouts). Consumed by `WorldClock.tsx` in Task 6.

- [ ] **Step 1: Write the failing tests**

Create `src/clock/icons/SparkleIcon.tsx` first (no test file — a static glyph, covered indirectly by the ControlCluster tests below that assert on the button, matching how `ShareIcon.tsx` has no dedicated test):

```tsx
// src/clock/icons/SparkleIcon.tsx
export function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="12,2 14.47,9.53 22,12 14.47,14.47 12,22 9.53,14.47 2,12 9.53,9.53" />
      <polygon points="19,3 22,6 19,9 16,6" />
    </svg>
  );
}
```

Append to `src/clock/ControlCluster.test.tsx`:

```tsx
describe('ControlCluster Find Time button (view mode)', () => {
  it('renders when onFindTime is provided', () => {
    render(
      <ControlCluster
        mode="view"
        onSetMode={vi.fn()}
        onShare={vi.fn()}
        isExpanded={false}
        onExpandedChange={vi.fn()}
        onFindTime={vi.fn()}
      />,
    );

    expect(screen.getByTestId('control-find-time-button').textContent).toContain('Find Time');
  });

  it('is absent when onFindTime is not provided', () => {
    render(
      <ControlCluster mode="view" onSetMode={vi.fn()} onShare={vi.fn()} isExpanded={false} onExpandedChange={vi.fn()} />,
    );

    expect(screen.queryByTestId('control-find-time-button')).toBeNull();
  });

  it('calls onFindTime when clicked, without needing the hamburger expanded', async () => {
    const user = userEvent.setup();
    const onFindTime = vi.fn();
    render(
      <ControlCluster
        mode="view"
        onSetMode={vi.fn()}
        onShare={vi.fn()}
        isExpanded={false}
        onExpandedChange={vi.fn()}
        onFindTime={onFindTime}
      />,
    );

    await user.click(screen.getByTestId('control-find-time-button'));

    expect(onFindTime).toHaveBeenCalledTimes(1);
  });
});

describe('ControlCluster Find Time button (scrub-action bar)', () => {
  function renderScrubBarWithFindTime(onFindTime = vi.fn()) {
    render(
      <ControlCluster
        mode="view"
        onSetMode={vi.fn()}
        onShare={vi.fn()}
        isExpanded={false}
        onExpandedChange={vi.fn()}
        scrubActions={{ onSchedule: vi.fn(), onCancel: vi.fn(), isScheduling: false }}
        onFindTime={onFindTime}
      />,
    );
    return onFindTime;
  }

  it('renders between Cancel and Schedule when onFindTime is provided', () => {
    renderScrubBarWithFindTime();

    const cancel = screen.getByTestId('control-scrub-cancel-button');
    const findTime = screen.getByTestId('control-find-time-button');
    const schedule = screen.getByTestId('control-scrub-schedule-button');
    const order = [cancel, findTime, schedule].map((el) => Array.from(el.parentElement!.children).indexOf(el));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('calls onFindTime when clicked in the scrub bar', async () => {
    const user = userEvent.setup();
    const onFindTime = renderScrubBarWithFindTime();

    await user.click(screen.getByTestId('control-find-time-button'));

    expect(onFindTime).toHaveBeenCalledTimes(1);
  });

  it('is absent from the matchedMeeting (Remove Meeting) layout even when onFindTime is provided', () => {
    render(
      <ControlCluster
        mode="view"
        onSetMode={vi.fn()}
        onShare={vi.fn()}
        isExpanded={false}
        onExpandedChange={vi.fn()}
        scrubActions={{ onSchedule: vi.fn(), onCancel: vi.fn(), isScheduling: false, matchedMeeting: { onRemove: vi.fn(), isRemoving: false } }}
        onFindTime={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('control-find-time-button')).toBeNull();
    expect(screen.getByTestId('control-remove-meeting-button')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/clock/ControlCluster.test.tsx`
Expected: FAIL — `onFindTime` isn't a recognized prop and no "Find Time" button is ever rendered.

- [ ] **Step 3: Write the implementation**

In `src/clock/ControlCluster.tsx`, add the import (alphabetically among the other icon imports):

```ts
import { SparkleIcon } from './icons/SparkleIcon';
```

Add to `ControlClusterProps` (after `isScrubHintActive?: boolean;`):

```ts
  // "Find Time" — undefined hides it entirely in both layouts below (the
  // caller, WorldClock.tsx, only passes a handler when there's at least one
  // ring city to search against). Shown in the view-mode row (always
  // visible, primary) and inside the scrub-action bar (secondary, between
  // Cancel and Schedule) whenever it's defined — except in the matchedMeeting
  // layout, which stays a lone Remove Meeting button as it does today.
  onFindTime?: () => void;
```

Add `onFindTime` to the destructured params (after `isScrubHintActive = false,`):

```ts
  onFindTime,
```

Inside the `if (scrubActions)` branch, in the non-matchedMeeting `<>...</>` (between the existing Cancel and Schedule buttons):

```tsx
        {scrubActions.matchedMeeting ? (
          <button
            type="button"
            data-testid="control-remove-meeting-button"
            className={styles.scrubRemoveMeetingButton}
            onClick={scrubActions.matchedMeeting.onRemove}
            disabled={scrubActions.matchedMeeting.isRemoving}
          >
            <TrashIcon isOpen={scrubActions.matchedMeeting.isRemoving} />
            {scrubActions.matchedMeeting.isRemoving ? 'Removing…' : 'Remove Meeting'}
          </button>
        ) : (
          <>
            <button
              type="button"
              data-testid="control-scrub-cancel-button"
              className={styles.scrubCancelButton}
              onClick={scrubActions.onCancel}
              disabled={scrubActions.isScheduling}
            >
              Cancel
            </button>
            {onFindTime && (
              <button
                type="button"
                data-testid="control-find-time-button"
                className={styles.findTimeButtonSecondary}
                onClick={onFindTime}
                disabled={scrubActions.isScheduling}
              >
                <SparkleIcon />
                Find Time
              </button>
            )}
            <button
              type="button"
              data-testid="control-scrub-schedule-button"
              className={styles.scrubScheduleButton}
              onClick={scrubActions.onSchedule}
              disabled={scrubActions.isScheduling}
            >
              {scrubActions.isScheduling ? 'Scheduling…' : 'Schedule'}
            </button>
          </>
        )}
```

Replace the base (non-scrub) return's opening (currently):

```tsx
  return (
    <div className={styles.cluster} data-expanded={isExpanded || undefined}>
      <div className={styles.actions}>
```

with:

```tsx
  return (
    <div className={styles.cluster} data-expanded={isExpanded || undefined}>
      {onFindTime && (
        <button type="button" data-testid="control-find-time-button" className={styles.findTimeButtonPrimary} onClick={onFindTime}>
          <SparkleIcon />
          Find Time
        </button>
      )}
      <div className={styles.actions}>
```

In `src/clock/ControlCluster.module.css`, append:

```css
.findTimeButtonPrimary,
.findTimeButtonSecondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  min-height: 34px;
  border-radius: 999px;
  font-family: 'Space Grotesk', -apple-system, sans-serif;
  font-weight: 600;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.findTimeButtonPrimary svg,
.findTimeButtonSecondary svg {
  flex: none;
  width: 14px;
  height: 14px;
}

/* always-visible in view mode (not tucked behind the hamburger toggle like
   Config/Share) — positioned clear of .actions' full expanded width (two
   34px icon buttons + gap = 78px) plus the 34px toggle plus gaps, so it
   never overlaps Config/Share sliding out from behind the toggle */
.findTimeButtonPrimary {
  position: absolute;
  top: 0;
  right: 132px;
  border: 1px solid #38bdf8;
  background: rgba(56, 189, 248, 0.16);
  color: #f5f6f8;
}

.findTimeButtonPrimary:hover {
  background: rgba(56, 189, 248, 0.24);
}

.findTimeButtonSecondary {
  border: 1px solid #3a3e46;
  background: rgba(20, 22, 29, 0.7);
  color: #c4c8cf;
}

.findTimeButtonSecondary:hover {
  border-color: #565b64;
  color: #f5f6f8;
}

.findTimeButtonSecondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (orientation: portrait) {
  .findTimeButtonPrimary {
    right: 156px;
  }

  .findTimeButtonPrimary,
  .findTimeButtonSecondary {
    min-height: 48px;
    padding: 0 20px;
    font-size: 15px;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/clock/ControlCluster.test.tsx`
Expected: PASS (all existing tests + 6 new Find Time tests)

- [ ] **Step 5: Commit**

```bash
git add src/clock/icons/SparkleIcon.tsx src/clock/ControlCluster.tsx src/clock/ControlCluster.module.css src/clock/ControlCluster.test.tsx
git commit -m "feat: add Find Time button to ControlCluster (view mode + scrub bar)"
```

---

### Task 6: `WorldClock.tsx` — 3-state ring arcs + per-ring checkboxes

**Files:**
- Create: `src/clock/RingIncludeCheckbox.tsx`
- Create: `src/clock/RingIncludeCheckbox.module.css`
- Create: `src/clock/RingIncludeCheckbox.test.tsx`
- Modify: `src/clock/WorldClock.tsx`
- Modify: `src/clock/WorldClock.test.tsx` (append)

**Interfaces:**
- Consumes: `CityFitStatus` from `./findMeetingTime` (Task 3); `pointOnCircle`'s `Point` type from `./geometry` (already exported, unchanged); `Location` from `./types`.
- Produces: `RingIncludeCheckbox(props: { location: Location; dotPosition: Point; checked: boolean; disabled: boolean; onToggle: () => void }): JSX.Element`, consumed by `WorldClock.tsx` in this same task. `WorldClockProps` gains `onFindTime?: () => void`, `isFindResultActive?: boolean`, `findResultStatusById?: Record<string, CityFitStatus>`, `excludedRingIds?: Set<string>`, `onToggleRingIncluded?: (id: string) => void` — all consumed by `App.tsx` in Task 7.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/clock/RingIncludeCheckbox.test.tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RingIncludeCheckbox } from './RingIncludeCheckbox';
import type { Location } from './types';

afterEach(() => {
  cleanup();
});

const LOCATION: Location = { id: 'tokyo', label: 'Tokyo', timezoneId: 'Asia/Tokyo', color: '#38BDF8', workStart: 9, workEnd: 18 };

describe('RingIncludeCheckbox', () => {
  it('renders a checkbox reflecting the checked prop', () => {
    render(<RingIncludeCheckbox location={LOCATION} dotPosition={{ x: 500, y: 340 }} checked={true} disabled={false} onToggle={vi.fn()} />);

    const checkbox = screen.getByTestId('ring-include-checkbox-tokyo') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(checkbox.disabled).toBe(false);
  });

  it('calls onToggle when clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<RingIncludeCheckbox location={LOCATION} dotPosition={{ x: 500, y: 340 }} checked={true} disabled={false} onToggle={onToggle} />);

    await user.click(screen.getByTestId('ring-include-checkbox-tokyo'));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders disabled and unclickable when disabled is true', () => {
    render(<RingIncludeCheckbox location={LOCATION} dotPosition={{ x: 500, y: 340 }} checked={true} disabled={true} onToggle={vi.fn()} />);

    expect((screen.getByTestId('ring-include-checkbox-tokyo') as HTMLInputElement).disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/clock/RingIncludeCheckbox.test.tsx`
Expected: FAIL — `Failed to resolve import "./RingIncludeCheckbox"`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/clock/RingIncludeCheckbox.tsx
import type { Point } from './geometry';
import type { Location } from './types';
import styles from './RingIncludeCheckbox.module.css';

export type RingIncludeCheckboxProps = {
  location: Location;
  dotPosition: Point;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
};

// geometry.ts's coordinates live in the SVG viewBox's 0-1000 space; CSS
// left/top percentages want 0-100 — mirrors ScrubHint.tsx's same conversion
const VIEWBOX_UNITS_PER_PERCENT = 10;

// sits at the ring's existing dot anchor — the fixed point (always at angle
// 0, so it never moves as the clock scrubs) between the curved name and time
// labels, already computed by WorldClock's ringViews. Reuses that exact
// geometry instead of measuring label text width, per the visual-companion
// mockup comparison during brainstorming (docs/superpowers/specs/2026-07-20-
// find-meeting-time-design.md).
export function RingIncludeCheckbox({ location, dotPosition, checked, disabled, onToggle }: RingIncludeCheckboxProps) {
  return (
    <label
      className={styles.checkboxWrap}
      style={
        {
          '--checkbox-left': `${dotPosition.x / VIEWBOX_UNITS_PER_PERCENT}%`,
          '--checkbox-top': `${dotPosition.y / VIEWBOX_UNITS_PER_PERCENT}%`,
        } as React.CSSProperties
      }
    >
      <input
        type="checkbox"
        className={styles.checkboxInput}
        data-testid={`ring-include-checkbox-${location.id}`}
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        aria-label={`Include ${location.label} in Find Time search`}
      />
    </label>
  );
}
```

```css
/* src/clock/RingIncludeCheckbox.module.css */
.checkboxWrap {
  position: absolute;
  left: var(--checkbox-left);
  top: var(--checkbox-top);
  transform: translate(-50%, -50%);
  display: inline-flex;
  width: 16px;
  height: 16px;
  cursor: pointer;
  z-index: var(--z-30);
}

.checkboxInput {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #38bdf8;
  cursor: pointer;
}

.checkboxInput:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/clock/RingIncludeCheckbox.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing WorldClock tests**

Append to `src/clock/WorldClock.test.tsx`:

```tsx
describe('WorldClock Find Time integration', () => {
  it('passes onFindTime through to ControlCluster only when there is at least one ring', () => {
    const onFindTime = vi.fn();
    renderClock('view', [SF], []);
    // baseline: renderClock's default helper doesn't pass onFindTime, so this
    // block re-renders directly with the prop wired through
    cleanup();
    render(
      <AnalyticsProvider service={createMockAnalyticsService()}>
        <WorldClock
          now={NOW}
          home={HOME}
          rings={[SF]}
          meetings={[]}
          mode="view"
          onSetMode={vi.fn()}
          onShare={vi.fn()}
          isMenuExpanded={false}
          onMenuExpandedChange={vi.fn()}
          onRemoveLocation={vi.fn()}
          onReorder={vi.fn()}
          onUpdateLocation={vi.fn()}
          onSetHome={vi.fn()}
          onFindTime={onFindTime}
        />
      </AnalyticsProvider>,
    );

    expect(screen.getByTestId('control-find-time-button')).toBeTruthy();
  });

  it('hides the Find Time button when there are no rings, even if onFindTime is provided', () => {
    render(
      <AnalyticsProvider service={createMockAnalyticsService()}>
        <WorldClock
          now={NOW}
          home={HOME}
          rings={[]}
          meetings={[]}
          mode="view"
          onSetMode={vi.fn()}
          onShare={vi.fn()}
          isMenuExpanded={false}
          onMenuExpandedChange={vi.fn()}
          onRemoveLocation={vi.fn()}
          onReorder={vi.fn()}
          onUpdateLocation={vi.fn()}
          onSetHome={vi.fn()}
          onFindTime={vi.fn()}
        />
      </AnalyticsProvider>,
    );

    expect(screen.queryByTestId('control-find-time-button')).toBeNull();
  });

  it('renders a checkbox per ring (not home) only while isFindResultActive', () => {
    render(
      <AnalyticsProvider service={createMockAnalyticsService()}>
        <WorldClock
          now={NOW}
          home={HOME}
          rings={[SF]}
          meetings={[]}
          mode="view"
          onSetMode={vi.fn()}
          onShare={vi.fn()}
          isMenuExpanded={false}
          onMenuExpandedChange={vi.fn()}
          onRemoveLocation={vi.fn()}
          onReorder={vi.fn()}
          onUpdateLocation={vi.fn()}
          onSetHome={vi.fn()}
          previewOffsetMs={MS_PER_HOUR}
          isFindResultActive={true}
          excludedRingIds={new Set()}
          onToggleRingIncluded={vi.fn()}
        />
      </AnalyticsProvider>,
    );

    expect(screen.getByTestId('ring-include-checkbox-san-francisco')).toBeTruthy();
    expect(screen.queryByTestId('ring-include-checkbox-tel-aviv')).toBeNull();
  });

  it('does not render any ring checkboxes when isFindResultActive is false', () => {
    render(
      <AnalyticsProvider service={createMockAnalyticsService()}>
        <WorldClock
          now={NOW}
          home={HOME}
          rings={[SF]}
          meetings={[]}
          mode="view"
          onSetMode={vi.fn()}
          onShare={vi.fn()}
          isMenuExpanded={false}
          onMenuExpandedChange={vi.fn()}
          onRemoveLocation={vi.fn()}
          onReorder={vi.fn()}
          onUpdateLocation={vi.fn()}
          onSetHome={vi.fn()}
        />
      </AnalyticsProvider>,
    );

    expect(screen.queryByTestId('ring-include-checkbox-san-francisco')).toBeNull();
  });

  it('calls onToggleRingIncluded with the ring id when its checkbox is clicked', async () => {
    const user = userEvent.setup();
    const onToggleRingIncluded = vi.fn();
    render(
      <AnalyticsProvider service={createMockAnalyticsService()}>
        <WorldClock
          now={NOW}
          home={HOME}
          rings={[SF]}
          meetings={[]}
          mode="view"
          onSetMode={vi.fn()}
          onShare={vi.fn()}
          isMenuExpanded={false}
          onMenuExpandedChange={vi.fn()}
          onRemoveLocation={vi.fn()}
          onReorder={vi.fn()}
          onUpdateLocation={vi.fn()}
          onSetHome={vi.fn()}
          previewOffsetMs={MS_PER_HOUR}
          isFindResultActive={true}
          excludedRingIds={new Set()}
          onToggleRingIncluded={onToggleRingIncluded}
        />
      </AnalyticsProvider>,
    );

    await user.click(screen.getByTestId('ring-include-checkbox-san-francisco'));

    expect(onToggleRingIncluded).toHaveBeenCalledWith('san-francisco');
  });

  it('disables the last remaining checked ring\'s checkbox', () => {
    const SF2: Location = { id: 'seattle', label: 'Seattle', timezoneId: 'America/Los_Angeles', color: '#34D399', workStart: 9, workEnd: 18 };
    render(
      <AnalyticsProvider service={createMockAnalyticsService()}>
        <WorldClock
          now={NOW}
          home={HOME}
          rings={[SF, SF2]}
          meetings={[]}
          mode="view"
          onSetMode={vi.fn()}
          onShare={vi.fn()}
          isMenuExpanded={false}
          onMenuExpandedChange={vi.fn()}
          onRemoveLocation={vi.fn()}
          onReorder={vi.fn()}
          onUpdateLocation={vi.fn()}
          onSetHome={vi.fn()}
          previewOffsetMs={MS_PER_HOUR}
          isFindResultActive={true}
          excludedRingIds={new Set(['seattle'])}
          onToggleRingIncluded={vi.fn()}
        />
      </AnalyticsProvider>,
    );

    expect((screen.getByTestId('ring-include-checkbox-san-francisco') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('ring-include-checkbox-seattle') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId('ring-include-checkbox-seattle') as HTMLInputElement).disabled).toBe(false);
  });

  it('renders a stretched ring with a dashed arc, from findResultStatusById', () => {
    const { container } = render(
      <AnalyticsProvider service={createMockAnalyticsService()}>
        <WorldClock
          now={NOW}
          home={HOME}
          rings={[SF]}
          meetings={[]}
          mode="view"
          onSetMode={vi.fn()}
          onShare={vi.fn()}
          isMenuExpanded={false}
          onMenuExpandedChange={vi.fn()}
          onRemoveLocation={vi.fn()}
          onReorder={vi.fn()}
          onUpdateLocation={vi.fn()}
          onSetHome={vi.fn()}
          previewOffsetMs={MS_PER_HOUR}
          isFindResultActive={true}
          findResultStatusById={{ 'tel-aviv': 'in-hours', 'san-francisco': 'stretched' }}
          excludedRingIds={new Set()}
          onToggleRingIncluded={vi.fn()}
        />
      </AnalyticsProvider>,
    );

    const stretchedArc = container.querySelector('path[data-fit-status="stretched"]');
    expect(stretchedArc?.getAttribute('stroke-dasharray')).toBe('4 4');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/clock/WorldClock.test.tsx`
Expected: FAIL — `WorldClock` doesn't yet accept `onFindTime`/`isFindResultActive`/`findResultStatusById`/`excludedRingIds`/`onToggleRingIncluded`, and no checkboxes or dashed arcs exist yet.

- [ ] **Step 7: Write the implementation**

In `src/clock/WorldClock.tsx`, add imports (alphabetically among the existing same-directory imports):

```ts
import type { CityFitStatus } from './findMeetingTime';
import { RingIncludeCheckbox } from './RingIncludeCheckbox';
```

Add to `WorldClockProps` (after the existing `isScrubHintDismissing?: boolean;`):

```ts
  // "Find Time" (see ControlCluster.tsx) — undefined hides the button
  // entirely; this component is the one that knows `rings.length`, so it's
  // the one that decides whether to forward the handler at all
  onFindTime?: () => void;
  // true from the moment a Find Time search lands (or a checkbox toggle
  // re-searches) until Cancel/Schedule/Remove-Meeting clears it — gates the
  // per-ring checkboxes and the 3-state arc styling below
  isFindResultActive?: boolean;
  findResultStatusById?: Record<string, CityFitStatus>;
  // rings the developer has unchecked out of the current Find Time search —
  // a ring not in this set is "checked" (included)
  excludedRingIds?: Set<string>;
  onToggleRingIncluded?: (id: string) => void;
```

Add to the destructured params (after `isScrubHintDismissing = false,`):

```ts
  onFindTime,
  isFindResultActive = false,
  findResultStatusById,
  excludedRingIds,
  onToggleRingIncluded,
```

Update `ringViews`' `useMemo` — replace:

```ts
  const ringViews = useMemo(
    () =>
      orderedLocations.map((location, index) => {
        const radius = ringRadius(index, totalRings);
        const labelRadius = radius + LABEL_RADIUS_OFFSET;
        const time = getCityTime(effectiveNow, location.timezoneId);
        const inHours = isWithinWorkingHours(time.frac, location.workStart, location.workEnd);
        const dotPosition = pointOnCircle(labelRadius, 0);
        return {
          location,
          radius,
          labelRadius,
          time,
          inHours,
          arcPath: workingHoursArcPath(radius, time.frac, location.workStart, location.workEnd),
          topArcPath: labelArcPath(labelRadius),
          dotPosition,
          textPathId: `${idPrefix}-tp-${index}`,
        };
      }),
    [orderedLocations, totalRings, effectiveNow, idPrefix],
  );
```

with:

```ts
  const ringViews = useMemo(
    () =>
      orderedLocations.map((location, index) => {
        const radius = ringRadius(index, totalRings);
        const labelRadius = radius + LABEL_RADIUS_OFFSET;
        const time = getCityTime(effectiveNow, location.timezoneId);
        const inHours = isWithinWorkingHours(time.frac, location.workStart, location.workEnd);
        const dotPosition = pointOnCircle(labelRadius, 0);
        const fitStatus = isFindResultActive ? findResultStatusById?.[location.id] : undefined;
        return {
          location,
          radius,
          labelRadius,
          time,
          inHours,
          fitStatus,
          arcPath: workingHoursArcPath(radius, time.frac, location.workStart, location.workEnd),
          topArcPath: labelArcPath(labelRadius),
          dotPosition,
          textPathId: `${idPrefix}-tp-${index}`,
        };
      }),
    [orderedLocations, totalRings, effectiveNow, idPrefix, isFindResultActive, findResultStatusById],
  );
```

Add a constant near the other color constants at the top of the file (alongside `STATUS_PARTIAL_COLOR`):

```ts
// a "stretched" ring (counted in the Find Time fit, but outside its real
// working hours) reuses the status row's own amber "partial" color — same
// semantic (a compromise, not a perfect fit), no new color introduced
const STRETCHED_ARC_COLOR = STATUS_PARTIAL_COLOR;
const STRETCHED_ARC_DASH = '4 4';
```

Update the glow + crisp arc rendering — replace:

```tsx
          <g filter={`url(#${glowFilterId})`} opacity={0.5}>
            {ringViews.map((ring) => (
              <path key={`glow-${ring.location.id}`} d={ring.arcPath} fill="none" stroke={ring.location.color} strokeWidth={7} strokeLinecap="round" />
            ))}
          </g>
          {ringViews.map((ring) => (
            <path key={`crisp-${ring.location.id}`} d={ring.arcPath} fill="none" stroke={ring.location.color} strokeWidth={6} strokeLinecap="round" />
          ))}
```

with:

```tsx
          <g filter={`url(#${glowFilterId})`} opacity={0.5}>
            {ringViews.map((ring) => (
              <path
                key={`glow-${ring.location.id}`}
                d={ring.arcPath}
                fill="none"
                stroke={ring.fitStatus === 'stretched' ? STRETCHED_ARC_COLOR : ring.location.color}
                strokeWidth={7}
                strokeLinecap="round"
                strokeDasharray={ring.fitStatus === 'stretched' ? STRETCHED_ARC_DASH : undefined}
              />
            ))}
          </g>
          {ringViews.map((ring) => (
            <path
              key={`crisp-${ring.location.id}`}
              d={ring.arcPath}
              fill="none"
              stroke={ring.fitStatus === 'stretched' ? STRETCHED_ARC_COLOR : ring.location.color}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={ring.fitStatus === 'stretched' ? STRETCHED_ARC_DASH : undefined}
              data-fit-status={ring.fitStatus}
            />
          ))}
```

Update the `<ControlCluster>` element — add `onFindTime` (only forwarded when there's at least one ring):

```tsx
        <ControlCluster
          mode={mode}
          onSetMode={onSetMode}
          onShare={onShare}
          isExpanded={isMenuExpanded}
          onExpandedChange={onMenuExpandedChange}
          scrubActions={scrubActions}
          isScrubHintActive={isScrubHintVisible}
          onFindTime={rings.length > 0 ? onFindTime : undefined}
        />
```

Update `isScrubActionBarVisible` — replace:

```ts
  const isScrubActionBarVisible = mode === 'view' && previewOffsetMs !== 0;
```

with:

```ts
  // a legitimately "found" result can land at offset 0 (now is already
  // optimal), so the bar must stay visible on isFindResultActive alone, not
  // just a nonzero preview offset
  const isScrubActionBarVisible = mode === 'view' && (previewOffsetMs !== 0 || isFindResultActive);
```

Render the checkboxes as a sibling to `ScrubHint`, inside `.clockContainer` (replace the closing of that div):

```tsx
        {isScrubHintVisible && (
          <ScrubHint
            offsetMs={previewOffsetMs}
            totalRings={totalRings}
            onDismiss={() => onDismissScrubHint?.()}
            isDismissing={isScrubHintDismissing}
          />
        )}

        {isFindResultActive &&
          ringViews
            .filter((ring) => !ring.location.isHome)
            .map((ring) => {
              const checkedCount = rings.length - (excludedRingIds?.size ?? 0);
              const isChecked = !excludedRingIds?.has(ring.location.id);
              return (
                <RingIncludeCheckbox
                  key={`include-${ring.location.id}`}
                  location={ring.location}
                  dotPosition={ring.dotPosition}
                  checked={isChecked}
                  disabled={isChecked && checkedCount === 1}
                  onToggle={() => onToggleRingIncluded?.(ring.location.id)}
                />
              );
            })}
      </div>
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/clock/WorldClock.test.tsx`
Expected: PASS (all existing tests + 8 new Find Time tests)

- [ ] **Step 9: Run the full test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS — `App.tsx` doesn't reference the new props yet, so its existing tests are unaffected.

- [ ] **Step 10: Commit**

```bash
git add src/clock/RingIncludeCheckbox.tsx src/clock/RingIncludeCheckbox.module.css src/clock/RingIncludeCheckbox.test.tsx src/clock/WorldClock.tsx src/clock/WorldClock.test.tsx
git commit -m "feat: render 3-state ring arcs and per-ring include checkboxes in WorldClock"
```

---

### Task 7: Wire everything into `App.tsx`

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx` (append)

**Interfaces:**
- Consumes: `findBestMeetingOffset`, `FindMeetingTimeResult` from `./clock/findMeetingTime` (Task 3); `useFindMeetingTimeSweep` from `./clock/useFindMeetingTimeSweep` (Task 4); `WorldClockProps`'s new `onFindTime`/`isFindResultActive`/`findResultStatusById`/`excludedRingIds`/`onToggleRingIncluded` (Task 6).
- Produces: fully wired feature — no further consumers.

- [ ] **Step 1: Write the failing tests**

Append to `src/App.test.tsx` (assumes the file already has a `renderApp()` helper and `stubMatchMedia()`/`beforeEach` matching the existing scrub-hint tests' conventions — reuse those as-is):

```tsx
describe('App — Find Time', () => {
  it('shows the Find Time button once at least one ring exists', () => {
    renderApp();
    expect(screen.getByTestId('control-find-time-button')).toBeTruthy();
  });

  it('lands on a found time and shows the scrub action bar with Find Time in it', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByTestId('control-find-time-button'));

    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    act(() => vi.advanceTimersByTime(700));
    vi.useRealTimers();

    expect(screen.getByTestId('control-scrub-cancel-button')).toBeTruthy();
    expect(screen.getByTestId('control-scrub-schedule-button')).toBeTruthy();
  });

  it('shows a checkbox for each ring city once a result is active, none for home', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
    for (const ring of config.rings) {
      expect(screen.getByTestId(`ring-include-checkbox-${ring.id}`)).toBeTruthy();
    }
    expect(screen.queryByTestId(`ring-include-checkbox-${config.home.id}`)).toBeNull();
  });

  it('unchecking a ring excludes it and re-lands on a new result', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
    const [firstRing] = config.rings;
    const checkbox = screen.getByTestId(`ring-include-checkbox-${firstRing.id}`) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);

    expect((screen.getByTestId(`ring-include-checkbox-${firstRing.id}`) as HTMLInputElement).checked).toBe(false);
  });

  it('re-checking a previously excluded ring includes it again', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
    const [firstRing] = config.rings;
    const checkbox = screen.getByTestId(`ring-include-checkbox-${firstRing.id}`) as HTMLInputElement;

    fireEvent.click(checkbox);
    expect((screen.getByTestId(`ring-include-checkbox-${firstRing.id}`) as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByTestId(`ring-include-checkbox-${firstRing.id}`));
    expect((screen.getByTestId(`ring-include-checkbox-${firstRing.id}`) as HTMLInputElement).checked).toBe(true);
  });

  it('disables the last remaining checked ring', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
    for (const ring of config.rings.slice(0, -1)) {
      fireEvent.click(screen.getByTestId(`ring-include-checkbox-${ring.id}`));
    }

    const lastRing = config.rings.at(-1);
    expect((screen.getByTestId(`ring-include-checkbox-${lastRing.id}`) as HTMLInputElement).disabled).toBe(true);
  });

  it('Cancel clears the find result: checkboxes disappear and the plain icon menu returns', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
    expect(screen.getByTestId(`ring-include-checkbox-${config.rings[0].id}`)).toBeTruthy();

    fireEvent.click(screen.getByTestId('control-scrub-cancel-button'));

    expect(screen.queryByTestId(`ring-include-checkbox-${config.rings[0].id}`)).toBeNull();
    expect(screen.getByTestId('control-find-time-button')).toBeTruthy();
    expect(screen.queryByTestId('control-scrub-cancel-button')).toBeNull();
  });

  it('re-clicking Find Time after excluding a city resets to a fresh search with every ring included', () => {
    renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
    const [firstRing] = config.rings;
    fireEvent.click(screen.getByTestId(`ring-include-checkbox-${firstRing.id}`));
    expect((screen.getByTestId(`ring-include-checkbox-${firstRing.id}`) as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByTestId('control-scrub-cancel-button'));
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    expect((screen.getByTestId(`ring-include-checkbox-${firstRing.id}`) as HTMLInputElement).checked).toBe(true);
  });

  it('fires find_meeting_time_clicked with the expected payload shape', () => {
    const { analytics } = renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    expect(analytics.trackEvent).toHaveBeenCalledWith(
      'find_meeting_time_clicked',
      expect.objectContaining({ ring_count: expect.any(Number), fit_count: expect.any(Number), perfect_count: expect.any(Number), is_perfect: expect.any(Boolean) }),
    );
  });

  it('fires find_meeting_time_city_excluded / _included on checkbox toggles', () => {
    const { analytics } = renderApp();
    fireEvent.click(screen.getByTestId('control-find-time-button'));

    const config = JSON.parse(window.localStorage.getItem('overlap:config:v1') ?? '{}');
    const [firstRing] = config.rings;
    const checkbox = screen.getByTestId(`ring-include-checkbox-${firstRing.id}`);

    fireEvent.click(checkbox);
    expect(analytics.trackEvent).toHaveBeenCalledWith('find_meeting_time_city_excluded', expect.objectContaining({ remaining_count: expect.any(Number) }));

    fireEvent.click(checkbox);
    expect(analytics.trackEvent).toHaveBeenCalledWith('find_meeting_time_city_included', expect.objectContaining({ remaining_count: expect.any(Number) }));
  });
});
```

If `renderApp()` doesn't already return `{ analytics }` (a handle on the mock `AnalyticsService` passed into `AnalyticsProvider`), extend it to do so — check the existing `AnalyticsProvider`/`createMockAnalyticsService` usage earlier in `App.test.tsx` for the established pattern and thread the same mock instance out of the helper rather than introducing a second one. If `App.test.tsx` doesn't already import `fireEvent`, add it to the existing `@testing-library/react` import line.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — `App.tsx` never renders a Find Time button or checkboxes yet.

- [ ] **Step 3: Write the implementation**

In `src/App.tsx`, update imports — add:

```ts
import { findBestMeetingOffset } from './clock/findMeetingTime';
import { useFindMeetingTimeSweep } from './clock/useFindMeetingTimeSweep';
```

(placed alphabetically alongside the other `./clock/*` imports, e.g. `findMeetingTime` right after `buildOverlapMeetingTitle`'s import line, `useFindMeetingTimeSweep` right after `useScrubHintDemo`'s import line — `useRef` is already imported from `'react'`, no change needed there).

After the existing `const liveScrubOffsetRef = useRef(scrubOffsetMs); liveScrubOffsetRef.current = scrubOffsetMs;` block, add:

```ts
  // Find Time: excludedRingIds tracks which ring cities the developer has
  // unchecked out of the current search (reset to empty on every fresh
  // "Find Time" click — see handleFindTime); findResult holds the last
  // search's classification, used both to render the 3-state ring arcs and
  // to know whether the scrub action bar/checkboxes should be showing at all
  // (isFindResultActive) even at offset 0 (an already-perfect "now").
  const [excludedRingIds, setExcludedRingIds] = useState<Set<string>>(() => new Set());
  const [findResult, setFindResult] = useState<FindMeetingTimeResult | null>(null);
  const isFindResultActive = findResult !== null;
  const findResultStatusById = useMemo(
    () => (findResult ? Object.fromEntries(findResult.cityResults.map((result) => [result.id, result.status])) : undefined),
    [findResult],
  );

  // drives the eased sweep to a found offset; `sweepTarget` is the trigger
  // (non-null while animating), `sweepFromRef` snapshots where the preview
  // was standing at the moment a search fired, mirroring the scrub-hint
  // return animation's own from/to handling
  const [sweepTarget, setSweepTarget] = useState<number | null>(null);
  const sweepFromRef = useRef(0);
  useFindMeetingTimeSweep({
    active: sweepTarget !== null,
    fromOffsetMs: sweepFromRef.current,
    toOffsetMs: sweepTarget ?? 0,
    setOffsetMs: scrubSetOffsetMs,
    onComplete: () => setSweepTarget(null),
  });

  // shared by handleFindTime and handleToggleRingIncluded — runs the search
  // over exactly the given rings, lands (or re-lands) the clock there, and
  // records the result for the 3-state arcs/checkboxes. Ignored while a
  // previous sweep is still animating (mirrors handleDismissScrubHint's own
  // `if (isDismissingScrubHint) return;` guard) since useFindMeetingTimeSweep
  // snapshots its target once per activation and won't redirect mid-flight.
  const runFindMeetingTime = useCallback(
    (rings: Location[]) => {
      if (sweepTarget !== null) return;
      const result = findBestMeetingOffset(now, config.home, rings);
      sweepFromRef.current = scrubOffsetMs;
      setFindResult(result);
      setSweepTarget(result.offsetMs);
      return result;
    },
    [sweepTarget, now, config.home, scrubOffsetMs],
  );

  const handleFindTime = useCallback(() => {
    setExcludedRingIds(new Set());
    const result = runFindMeetingTime(config.rings);
    if (!result) return;
    analytics.trackEvent('find_meeting_time_clicked', {
      ring_count: config.rings.length,
      fit_count: result.fitCount,
      perfect_count: result.perfectCount,
      is_perfect: result.perfectCount === result.totalCount,
    });
  }, [config.rings, runFindMeetingTime, analytics]);

  const handleToggleRingIncluded = useCallback(
    (id: string) => {
      const wasExcluded = excludedRingIds.has(id);
      const nextExcluded = new Set(excludedRingIds);
      if (wasExcluded) nextExcluded.delete(id);
      else nextExcluded.add(id);
      setExcludedRingIds(nextExcluded);

      const includedRings = config.rings.filter((ring) => !nextExcluded.has(ring.id));
      const result = runFindMeetingTime(includedRings);
      if (!result) return;
      analytics.trackEvent(wasExcluded ? 'find_meeting_time_city_included' : 'find_meeting_time_city_excluded', {
        remaining_count: includedRings.length,
      });
    },
    [excludedRingIds, config.rings, runFindMeetingTime, analytics],
  );

  // clears the find-result state alongside a real resetScrub() — used
  // everywhere Cancel/Schedule/Remove-Meeting already return the clock to
  // "now", so a landed find result never lingers (stale checkboxes/arcs)
  // once the developer has backed out of it
  const clearFindResult = useCallback(() => {
    setFindResult(null);
    setExcludedRingIds(new Set());
    setSweepTarget(null);
  }, []);

  const handleBackToNow = useCallback(() => {
    resetScrub();
    clearFindResult();
  }, [resetScrub, clearFindResult]);
```

Update `handleQuickSchedule`'s success path — replace:

```ts
      if (liveScrubOffsetRef.current === startOffsetMs) resetScrub();
```

(the one inside the `try` block, immediately after `showToast('Meeting scheduled')` and the `analytics.trackEvent('meeting_scheduled', ...)` call) with:

```ts
      if (liveScrubOffsetRef.current === startOffsetMs) {
        resetScrub();
        clearFindResult();
      }
```

Add `clearFindResult` to `handleQuickSchedule`'s dependency array.

Update `handleRemoveMatchedMeeting`'s success path the same way — replace:

```ts
      if (liveScrubOffsetRef.current === startOffsetMs) resetScrub();
```

with:

```ts
      if (liveScrubOffsetRef.current === startOffsetMs) {
        resetScrub();
        clearFindResult();
      }
```

Add `clearFindResult` to `handleRemoveMatchedMeeting`'s dependency array.

Update the `<WorldClock>` JSX — change `onBackToNow={resetScrub}` to `onBackToNow={handleBackToNow}`, and add the new props (placed after the existing `isScrubHintDismissing={isDismissingScrubHint}`):

```tsx
      onBackToNow={handleBackToNow}
      ...
      isScrubHintDismissing={isDismissingScrubHint}
      onFindTime={handleFindTime}
      isFindResultActive={isFindResultActive}
      findResultStatusById={findResultStatusById}
      excludedRingIds={excludedRingIds}
      onToggleRingIncluded={handleToggleRingIncluded}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (all existing tests + the new "App — Find Time" describe block)

- [ ] **Step 5: Run the full test suite, build, and lint**

Run: `npx vitest run`
Expected: PASS — no regressions anywhere.

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

Run: `npm run lint`
Expected: no new warnings/errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: wire Find Time into App"
```

## Self-Review

**Spec coverage:** every "Decisions locked during brainstorming" bullet in the spec maps to a task — home always included/never excludable (Task 3's `findBestMeetingOffset` always includes `home`, `WorldClock`'s checkbox loop filters `!ring.location.isHome`); sweep-line algorithm with strict-then-stretch fallback (Tasks 1–3); quarter-hour landing snap (Task 3's `snapForwardToQuarterHour`); no toast (nothing added — the existing status row is untouched and still reads live); button copy/placement in both layouts (Task 5); checkbox (not X) at the dot anchor, auto re-search, min-ring disable (Task 6 + Task 7's `handleToggleRingIncluded`); distinct stretched-ring arc (Task 6); zero-rings hides the button (Task 6's `rings.length > 0 ? onFindTime : undefined`); exit only via Cancel/Schedule/Remove-Meeting (Task 7's `clearFindResult` wired into all three); analytics events with the documented payloads (Task 7).

**Placeholder scan:** no TBD/TODO; every step has complete, runnable code.

**Type consistency:** `findBestMeetingOffset(now, home, includedRings)` (Task 3) matches its Task 7 call site exactly. `useFindMeetingTimeSweep({ active, fromOffsetMs, toOffsetMs, setOffsetMs, onComplete })` (Task 4) matches Task 7's call exactly. `RingIncludeCheckbox({ location, dotPosition, checked, disabled, onToggle })` (Task 6) matches its render call in the same task exactly. `ControlClusterProps.onFindTime` (Task 5) matches `WorldClockProps.onFindTime` (Task 6) and the value `App.tsx` passes (Task 7). `WorldClockProps`'s `isFindResultActive`/`findResultStatusById`/`excludedRingIds`/`onToggleRingIncluded` (Task 6) all match the values Task 7 computes and passes.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-20-find-meeting-time.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
