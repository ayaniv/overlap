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
