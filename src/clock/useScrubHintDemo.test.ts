import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANGLE_REST_DEG, SCRUB_HINT_PERIOD_MS, useScrubHintDemo } from './useScrubHintDemo';
import { offsetMsFromAngle } from './geometry';

const PEAK_ANGLE_DEG = 75; // +5h forward, matches useScrubHintDemo's internal ANGLE_PEAK_DEG
const PEAK_OFFSET_MS = offsetMsFromAngle(PEAK_ANGLE_DEG);
const REST_OFFSET_MS = offsetMsFromAngle(ANGLE_REST_DEG);

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
  it('eases forward toward the peak during phase 1, never overshooting it', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const setOffsetMs = vi.fn();
    renderHook(() => useScrubHintDemo({ active: true, setOffsetMs }));

    vi.advanceTimersByTime(2000); // partway through phase 1 (3600ms)

    expect(setOffsetMs).toHaveBeenCalled();
    const values = setOffsetMs.mock.calls.map((call) => call[0] as number);
    expect(values.every((v) => v >= -1 && v <= PEAK_OFFSET_MS + 1)).toBe(true);
    expect(values.some((v) => v > 0)).toBe(true);
  });

  it('settles exactly at the rest offset once the full sequence finishes', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
    const setOffsetMs = vi.fn();
    renderHook(() => useScrubHintDemo({ active: true, setOffsetMs }));

    vi.advanceTimersByTime(SCRUB_HINT_PERIOD_MS + 200);

    const lastValue = setOffsetMs.mock.calls.at(-1)?.[0] as number;
    expect(lastValue).toBeCloseTo(REST_OFFSET_MS, 0);
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

    vi.advanceTimersByTime(SCRUB_HINT_PERIOD_MS + 2000);

    expect(setOffsetMs).not.toHaveBeenCalled();
  });
});
