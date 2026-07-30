import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsBigScreen } from './useIsBigScreen';

function stubScreenSize(width: number, height: number) {
  Object.defineProperty(window.screen, 'width', { value: width, configurable: true });
  Object.defineProperty(window.screen, 'height', { value: height, configurable: true });
}

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

  it('is false exactly at the threshold — 1920 must not count as big', () => {
    stubScreenSize(1920, 1080);
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
