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
