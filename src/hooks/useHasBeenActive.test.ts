import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHasBeenActive } from './useHasBeenActive';

describe('useHasBeenActive', () => {
  it('is false immediately after mount', () => {
    const { result } = renderHook(() => useHasBeenActive());
    expect(result.current).toBe(false);
  });

  it('flips to true after a pointermove', () => {
    const { result } = renderHook(() => useHasBeenActive());
    act(() => window.dispatchEvent(new Event('pointermove')));
    expect(result.current).toBe(true);
  });

  it('flips to true after a pointerdown', () => {
    const { result } = renderHook(() => useHasBeenActive());
    act(() => window.dispatchEvent(new Event('pointerdown')));
    expect(result.current).toBe(true);
  });

  it('flips to true after a touchstart', () => {
    const { result } = renderHook(() => useHasBeenActive());
    act(() => window.dispatchEvent(new Event('touchstart')));
    expect(result.current).toBe(true);
  });

  it('never flips true from a keydown alone', () => {
    const { result } = renderHook(() => useHasBeenActive());
    act(() => window.dispatchEvent(new Event('keydown')));
    expect(result.current).toBe(false);
  });

  it('stays true after latching, with no further activity', () => {
    const { result } = renderHook(() => useHasBeenActive());
    act(() => window.dispatchEvent(new Event('pointerdown')));
    expect(result.current).toBe(true);
    expect(result.current).toBe(true);
  });
});
