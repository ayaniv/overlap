import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsKioskDisplay } from './useIsKioskDisplay';

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

function stubMediaQueries(portrait: boolean, touchPrimary: boolean) {
  const portraitMql = new FakeMediaQueryList(portrait);
  const pointerMql = new FakeMediaQueryList(touchPrimary);
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => (query === '(orientation: portrait)' ? portraitMql : pointerMql)),
  );
  return { portraitMql, pointerMql };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useIsKioskDisplay', () => {
  it('is false in landscape, regardless of input type', () => {
    stubMediaQueries(false, false);
    const { result } = renderHook(() => useIsKioskDisplay());
    expect(result.current).toBe(false);
  });

  it('is false in portrait on a touch-primary device — a phone/tablet held upright', () => {
    stubMediaQueries(true, true);
    const { result } = renderHook(() => useIsKioskDisplay());
    expect(result.current).toBe(false);
  });

  it('is true in portrait on a non-touch device — a mouse/remote/unattended kiosk display', () => {
    stubMediaQueries(true, false);
    const { result } = renderHook(() => useIsKioskDisplay());
    expect(result.current).toBe(true);
  });

  it('is false in landscape even on a touch-primary device', () => {
    stubMediaQueries(false, true);
    const { result } = renderHook(() => useIsKioskDisplay());
    expect(result.current).toBe(false);
  });

  it('updates live when orientation changes', () => {
    const { portraitMql } = stubMediaQueries(false, false);
    const { result } = renderHook(() => useIsKioskDisplay());
    expect(result.current).toBe(false);

    act(() => portraitMql.emit(true));
    expect(result.current).toBe(true);
  });

  it('updates live when input type changes (e.g. a touchscreen kiosk gets touched)', () => {
    const { pointerMql } = stubMediaQueries(true, false);
    const { result } = renderHook(() => useIsKioskDisplay());
    expect(result.current).toBe(true);

    act(() => pointerMql.emit(true));
    expect(result.current).toBe(false);
  });
});
