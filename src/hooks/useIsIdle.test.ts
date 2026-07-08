import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsIdle } from './useIsIdle';

afterEach(() => {
  vi.useRealTimers();
});

describe('useIsIdle', () => {
  it('is false immediately after mount', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useIsIdle(1000));
    expect(result.current).toBe(false);
  });

  it('becomes true once timeoutMs elapses with no activity', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useIsIdle(1000));

    act(() => vi.advanceTimersByTime(1000));

    expect(result.current).toBe(true);
  });

  it('is not yet idle just before the timeout elapses', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useIsIdle(1000));

    act(() => vi.advanceTimersByTime(999));

    expect(result.current).toBe(false);
  });

  it('resets the timer on a pointermove (covers mouse movement/hover)', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useIsIdle(1000));

    act(() => vi.advanceTimersByTime(900));
    act(() => window.dispatchEvent(new Event('pointermove')));
    act(() => vi.advanceTimersByTime(900));

    expect(result.current).toBe(false);
  });

  it('clears an already-idle state back to false on a keydown', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useIsIdle(1000));

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(true);

    act(() => window.dispatchEvent(new Event('keydown')));

    expect(result.current).toBe(false);
  });

  it('clears an already-idle state back to false on a touchstart', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useIsIdle(1000));

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(true);

    act(() => window.dispatchEvent(new Event('touchstart')));

    expect(result.current).toBe(false);
  });

  it('clears an already-idle state back to false on a pointerdown (click/tap)', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useIsIdle(1000));

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(true);

    act(() => window.dispatchEvent(new Event('pointerdown')));

    expect(result.current).toBe(false);
  });

  it('removes its listeners and cancels the timer on unmount', () => {
    vi.useFakeTimers();
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useIsIdle(1000));
    const registeredEvents = addSpy.mock.calls.map(([eventName]) => eventName);

    unmount();

    const removedEvents = removeSpy.mock.calls.map(([eventName]) => eventName);
    expect(removedEvents).toEqual(expect.arrayContaining(registeredEvents));
  });
});
