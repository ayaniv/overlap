import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubScreenSize } from '../testHelpers';
import { BIG_SCREEN_LONG_EDGE_PX, useIsBigVerticalScreen } from './useIsBigVerticalScreen';

afterEach(() => {
  // jsdom defaults window.screen.width/height to 0; restore that so a stub in one test
  // never leaks into the next
  stubScreenSize(0, 0);
});

describe('useIsBigVerticalScreen', () => {
  it('is false on a small/default screen', () => {
    stubScreenSize(1024, 768);
    const { result } = renderHook(() => useIsBigVerticalScreen());
    expect(result.current).toBe(false);
  });

  it('is false on a big screen in landscape — a wide desktop monitor is a normal desk setup', () => {
    stubScreenSize(3840, 2160);
    const { result } = renderHook(() => useIsBigVerticalScreen());
    expect(result.current).toBe(false);
  });

  it('is true on a big screen rotated to portrait', () => {
    stubScreenSize(2160, 3840);
    const { result } = renderHook(() => useIsBigVerticalScreen());
    expect(result.current).toBe(true);
  });

  it('is false on a small screen in portrait — a phone held upright stays small', () => {
    stubScreenSize(390, 844);
    const { result } = renderHook(() => useIsBigVerticalScreen());
    expect(result.current).toBe(false);
  });

  it('is true exactly at the threshold in portrait — inclusive boundary', () => {
    stubScreenSize(1080, BIG_SCREEN_LONG_EDGE_PX);
    const { result } = renderHook(() => useIsBigVerticalScreen());
    expect(result.current).toBe(true);
  });

  it('is false just below the threshold in portrait', () => {
    stubScreenSize(1080, BIG_SCREEN_LONG_EDGE_PX - 1);
    const { result } = renderHook(() => useIsBigVerticalScreen());
    expect(result.current).toBe(false);
  });

  it('updates live when the screen rotates from landscape to portrait (a "resize" event fires)', () => {
    stubScreenSize(3840, 2160);
    const { result } = renderHook(() => useIsBigVerticalScreen());
    expect(result.current).toBe(false);

    act(() => {
      stubScreenSize(2160, 3840);
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(true);
  });

  it('removes its resize listener on unmount', () => {
    stubScreenSize(1024, 768);
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useIsBigVerticalScreen());
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
