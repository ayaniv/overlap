import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsPortrait } from './useIsPortrait';

class FakeMediaQueryList {
  matches: boolean;
  private listeners = new Set<(event: { matches: boolean }) => void>();

  constructor(matches: boolean) {
    this.matches = matches;
  }

  addEventListener(_type: 'change', listener: (event: { matches: boolean }) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'change', listener: (event: { matches: boolean }) => void) {
    this.listeners.delete(listener);
  }

  emit(matches: boolean) {
    this.matches = matches;
    for (const listener of this.listeners) listener({ matches });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useIsPortrait', () => {
  it('reads the initial orientation from matchMedia', () => {
    const mql = new FakeMediaQueryList(true);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));

    const { result } = renderHook(() => useIsPortrait());
    expect(result.current).toBe(true);
  });

  it('is false when the query does not match', () => {
    const mql = new FakeMediaQueryList(false);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));

    const { result } = renderHook(() => useIsPortrait());
    expect(result.current).toBe(false);
  });

  it('updates live when orientation changes (a "change" event fires)', () => {
    const mql = new FakeMediaQueryList(false);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));

    const { result } = renderHook(() => useIsPortrait());
    expect(result.current).toBe(false);

    act(() => mql.emit(true));
    expect(result.current).toBe(true);

    act(() => mql.emit(false));
    expect(result.current).toBe(false);
  });

  it('removes its change listener on unmount', () => {
    const mql = new FakeMediaQueryList(false);
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
    const removeSpy = vi.spyOn(mql, 'removeEventListener');

    const { unmount } = renderHook(() => useIsPortrait());
    unmount();

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
