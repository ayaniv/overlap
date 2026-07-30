import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubScreenSize } from '../testHelpers';
import { BIG_SCREEN_LONG_EDGE_PX, useIsBigScreen } from './useIsBigScreen';

afterEach(() => {
  // jsdom defaults window.screen.width/height to 0; restore that so a stub in one test
  // never leaks into the next
  stubScreenSize(0, 0);
});

describe('useIsBigScreen', () => {
  it('is false on a small/default screen', () => {
    stubScreenSize(1024, 768);
    const { result } = renderHook(() => useIsBigScreen());
    expect(result.current).toBe(false);
  });

  it('is true exactly at the threshold — inclusive boundary', () => {
    stubScreenSize(BIG_SCREEN_LONG_EDGE_PX, 1080);
    const { result } = renderHook(() => useIsBigScreen());
    expect(result.current).toBe(true);
  });

  it('is false just below the threshold', () => {
    stubScreenSize(BIG_SCREEN_LONG_EDGE_PX - 1, 1080);
    const { result } = renderHook(() => useIsBigScreen());
    expect(result.current).toBe(false);
  });

  it('is true once the long edge exceeds the big-screen threshold, landscape', () => {
    stubScreenSize(3840, 2160);
    const { result } = renderHook(() => useIsBigScreen());
    expect(result.current).toBe(true);
  });

  it('is true at the same size rotated to portrait — orientation does not matter', () => {
    stubScreenSize(2160, 3840);
    const { result } = renderHook(() => useIsBigScreen());
    expect(result.current).toBe(true);
  });

  it('updates live when the screen resolution changes (a "resize" event fires)', () => {
    stubScreenSize(1024, 768);
    const { result } = renderHook(() => useIsBigScreen());
    expect(result.current).toBe(false);

    act(() => {
      stubScreenSize(3840, 2160);
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(true);
  });

  it('removes its resize listener on unmount', () => {
    stubScreenSize(1024, 768);
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useIsBigScreen());
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
