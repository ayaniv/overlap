import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNow } from './useNow';

afterEach(() => {
  vi.useRealTimers();
});

describe('useNow', () => {
  it('is the current time immediately on mount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.437Z'));

    const { result } = renderHook(() => useNow());

    expect(result.current.getTime()).toBe(new Date('2026-01-01T12:00:00.437Z').getTime());
  });

  // regression: mounting mid-second used to start a plain setInterval(fn, 1000) right then,
  // so every later update landed at mount-time-plus-a-multiple-of-1000ms — a phase forever
  // offset from real wall-clock second boundaries by however far into the second the
  // component happened to mount. Anything derived from `now` (city/home time labels, ring
  // arcs) would then visibly lag or lead the moment a real second (and, once a minute, the
  // sweep hand crossing the topmost point) actually ticks over. The first update must land
  // on the next real second boundary instead, however far into the current second mount
  // happened to occur.
  it('aligns its first update to the next real wall-clock second boundary, not 1000ms after mount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.437Z')); // 437ms into the second

    const { result } = renderHook(() => useNow());

    act(() => vi.advanceTimersByTime(562)); // just short of the boundary (437 + 562 = 999)
    expect(result.current.getTime()).toBe(new Date('2026-01-01T12:00:00.437Z').getTime());

    act(() => vi.advanceTimersByTime(1)); // lands exactly on the boundary
    expect(result.current.getTime()).toBe(new Date('2026-01-01T12:00:01.000Z').getTime());
  });

  it('keeps ticking once a second, staying aligned to real second boundaries thereafter', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.437Z'));

    const { result } = renderHook(() => useNow());

    act(() => vi.advanceTimersByTime(3000));

    expect(result.current.getTime()).toBe(new Date('2026-01-01T12:00:03.000Z').getTime());
  });

  it('needs no realignment when mount lands exactly on a second boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));

    const { result } = renderHook(() => useNow());

    act(() => vi.advanceTimersByTime(1000));

    expect(result.current.getTime()).toBe(new Date('2026-01-01T12:00:01.000Z').getTime());
  });

  it('clears both the alignment timeout and the interval on unmount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.437Z'));
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    const { unmount } = renderHook(() => useNow());
    act(() => vi.advanceTimersByTime(563)); // past the alignment boundary, interval now running

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
