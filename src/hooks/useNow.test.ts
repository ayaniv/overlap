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

  // regression: mounting mid-minute used to start a plain setInterval(fn, 60000) right
  // then, so every later update landed at mount-time-plus-a-multiple-of-60000ms — a phase
  // forever offset from real wall-clock minute boundaries by however far into the minute
  // the component happened to mount. Anything derived from `now` (city/home time labels,
  // ring arcs) would then visibly lag or lead the moment a real minute actually ticks
  // over. The first update must land on the next real minute boundary instead, however far
  // into the current minute mount happened to occur.
  it('aligns its first update to the next real wall-clock minute boundary, not intervalMs after mount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.437Z')); // 437ms into the minute

    const { result } = renderHook(() => useNow());

    act(() => vi.advanceTimersByTime(59562)); // just short of the boundary (437 + 59562 = 59999)
    expect(result.current.getTime()).toBe(new Date('2026-01-01T12:00:00.437Z').getTime());

    act(() => vi.advanceTimersByTime(1)); // lands exactly on the boundary
    expect(result.current.getTime()).toBe(new Date('2026-01-01T12:01:00.000Z').getTime());
  });

  it('keeps ticking once a minute, staying aligned to real minute boundaries thereafter', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.437Z'));

    const { result } = renderHook(() => useNow());

    act(() => vi.advanceTimersByTime(3 * 60_000));

    expect(result.current.getTime()).toBe(new Date('2026-01-01T12:03:00.000Z').getTime());
  });

  it('needs no realignment when mount lands exactly on a minute boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));

    const { result } = renderHook(() => useNow());

    act(() => vi.advanceTimersByTime(60_000));

    expect(result.current.getTime()).toBe(new Date('2026-01-01T12:01:00.000Z').getTime());
  });

  it('clears the pending alignment timeout on unmount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.437Z'));
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    // advance past the first boundary so the effect has already rescheduled once —
    // this is the pending timeout that must actually get cleared, not just the
    // first one (which already fired and is a no-op to clear)
    const { unmount } = renderHook(() => useNow());
    act(() => vi.advanceTimersByTime(59_563));

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  // failure-path regression: a recursive setTimeout that isn't torn down on unmount
  // reschedules itself forever — an unbounded leak, unlike a forgotten setInterval
  // which is at least a single stable handle. Confirm the recursion actually stops.
  it('stops rescheduling after unmount — no update fires for time that passes afterward', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.437Z'));

    const { result, unmount } = renderHook(() => useNow());
    act(() => vi.advanceTimersByTime(59_563)); // one real update, at the first boundary
    expect(result.current.getTime()).toBe(new Date('2026-01-01T12:01:00.000Z').getTime());

    unmount();
    act(() => vi.advanceTimersByTime(5 * 60_000)); // well past several more would-be boundaries

    expect(vi.getTimerCount()).toBe(0);
  });
});
