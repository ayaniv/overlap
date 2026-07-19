import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MS_PER_HOUR } from './geometry';
import { SCRUB_HINT_RETURN_MS, useScrubHintReturn } from './useScrubHintReturn';

// where the demo leaves the hand when "Got it" is clicked at rest
const START_OFFSET_MS = 3 * MS_PER_HOUR;

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

describe('useScrubHintReturn', () => {
  it('eases the offset from the start value down to exactly 0', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const setOffsetMs = vi.fn();
    renderHook(() =>
      useScrubHintReturn({ active: true, fromOffsetMs: START_OFFSET_MS, setOffsetMs, onComplete: vi.fn() }),
    );

    vi.advanceTimersByTime(SCRUB_HINT_RETURN_MS + 100);

    const values = setOffsetMs.mock.calls.map((call) => call[0] as number);
    expect(values.at(-1)).toBe(0);
    // stays within the return arc the whole way — never overshoots past now,
    // never swings back out beyond where it started
    expect(values.every((v) => v >= 0 && v <= START_OFFSET_MS)).toBe(true);
    // actually eased through intermediate positions rather than snapping
    expect(values.some((v) => v > 0 && v < START_OFFSET_MS)).toBe(true);
  });

  it('calls onComplete exactly once, only after the full duration has elapsed', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const onComplete = vi.fn();
    renderHook(() =>
      useScrubHintReturn({ active: true, fromOffsetMs: START_OFFSET_MS, setOffsetMs: vi.fn(), onComplete }),
    );

    vi.advanceTimersByTime(SCRUB_HINT_RETURN_MS - 100);
    expect(onComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(onComplete).toHaveBeenCalledTimes(1);

    // the loop has stopped — no further frames keep firing it
    vi.advanceTimersByTime(1000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not touch the offset while inactive', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const setOffsetMs = vi.fn();
    const onComplete = vi.fn();
    renderHook(() =>
      useScrubHintReturn({ active: false, fromOffsetMs: START_OFFSET_MS, setOffsetMs, onComplete }),
    );

    vi.advanceTimersByTime(SCRUB_HINT_RETURN_MS + 500);

    expect(setOffsetMs).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('stops animating when unmounted mid-return', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const setOffsetMs = vi.fn();
    const onComplete = vi.fn();
    const { unmount } = renderHook(() =>
      useScrubHintReturn({ active: true, fromOffsetMs: START_OFFSET_MS, setOffsetMs, onComplete }),
    );

    vi.advanceTimersByTime(100);
    unmount();
    setOffsetMs.mockClear();

    vi.advanceTimersByTime(SCRUB_HINT_RETURN_MS + 500);

    expect(setOffsetMs).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('skips the animation entirely under prefers-reduced-motion, completing immediately', () => {
    stubMatchMedia(true);
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const setOffsetMs = vi.fn();
    const onComplete = vi.fn();
    renderHook(() =>
      useScrubHintReturn({ active: true, fromOffsetMs: START_OFFSET_MS, setOffsetMs, onComplete }),
    );

    // no timer advance at all — it must already be done
    expect(setOffsetMs).toHaveBeenCalledWith(0);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('returns from the live offset at activation, not a stale one', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const setOffsetMs = vi.fn();
    // clicking "Got it" mid-sweep must return from wherever the hand actually
    // is, so the hook reads fromOffsetMs at the moment it becomes active
    const { rerender } = renderHook(
      ({ active, fromOffsetMs }) =>
        useScrubHintReturn({ active, fromOffsetMs, setOffsetMs, onComplete: vi.fn() }),
      { initialProps: { active: false, fromOffsetMs: 0 } },
    );

    rerender({ active: true, fromOffsetMs: MS_PER_HOUR });
    vi.advanceTimersByTime(16);

    const firstValue = setOffsetMs.mock.calls[0]?.[0] as number;
    expect(firstValue).toBeGreaterThan(0);
    expect(firstValue).toBeLessThanOrEqual(MS_PER_HOUR);
  });
});
