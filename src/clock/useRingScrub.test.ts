import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRingScrub } from './useRingScrub';
import { MS_PER_HOUR } from './geometry';

const CENTER_X = 100;
const CENTER_Y = 100;
const RADIUS = 80;

// mirrors angleFromCenterOffset's atan2(dx, -dy) convention: 0deg is straight up
// (12 o'clock), increasing clockwise
function clientPointAtAngle(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { clientX: CENTER_X + RADIUS * Math.sin(rad), clientY: CENTER_Y - RADIUS * Math.cos(rad) };
}

function fakeTarget() {
  return {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CENTER_X * 2, height: CENTER_Y * 2 }),
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn().mockReturnValue(true),
    releasePointerCapture: vi.fn(),
  };
}

// casts a partial fake event through unknown, matching this hook's actual usage
// (currentTarget.getBoundingClientRect/setPointerCapture, clientX/clientY, pointerId)
function pointerEvent(angleDeg: number, currentTarget: ReturnType<typeof fakeTarget>, pointerId = 1) {
  return { currentTarget, pointerId, ...clientPointAtAngle(angleDeg) } as unknown as Parameters<
    ReturnType<typeof useRingScrub>['bind']['onPointerDown']
  >[0];
}

describe('useRingScrub', () => {
  it('accumulates a single short drag as expected', () => {
    const { result } = renderHook(() => useRingScrub());
    const target = fakeTarget();

    act(() => result.current.bind.onPointerDown(pointerEvent(0, target)));
    act(() => result.current.bind.onPointerMove(pointerEvent(90, target)));

    expect(result.current.previewOffsetMs).toBeCloseTo((90 / 15) * MS_PER_HOUR);
  });

  it('keeps accumulating past 180deg of total rotation instead of snapping backwards', () => {
    // regression test: a continuous drag used to measure every move against the
    // drag's *start* angle, and angleDelta only returns values in (-180, 180] — so
    // once the total sweep from the start passed half a turn, the computed delta
    // wrapped to the short way around and the preview jumped backwards mid-drag
    const { result } = renderHook(() => useRingScrub());
    const target = fakeTarget();

    act(() => result.current.bind.onPointerDown(pointerEvent(0, target)));
    // sweep clockwise in small (unambiguous) steps, well past a full turn
    const angles = [45, 90, 135, 180, 225, 270, 315, 360, 405];
    for (const angle of angles) {
      act(() => result.current.bind.onPointerMove(pointerEvent(angle, target)));
    }

    // 405deg of continuous clockwise rotation, at 15deg/hour
    expect(result.current.previewOffsetMs).toBeCloseTo((405 / 15) * MS_PER_HOUR);
  });

  it('accumulates a counter-clockwise multi-turn drag symmetrically', () => {
    const { result } = renderHook(() => useRingScrub());
    const target = fakeTarget();

    act(() => result.current.bind.onPointerDown(pointerEvent(0, target)));
    const angles = [-45, -90, -135, -180, -225, -270, -315, -360, -405];
    for (const angle of angles) {
      act(() => result.current.bind.onPointerMove(pointerEvent(angle, target)));
    }

    expect(result.current.previewOffsetMs).toBeCloseTo((-405 / 15) * MS_PER_HOUR);
  });

  it('starts a fresh drag from wherever the previous one left off', () => {
    const { result } = renderHook(() => useRingScrub());
    const target = fakeTarget();

    act(() => result.current.bind.onPointerDown(pointerEvent(0, target)));
    act(() => result.current.bind.onPointerMove(pointerEvent(90, target)));
    act(() => result.current.bind.onPointerUp(pointerEvent(90, target)));

    const afterFirstDrag = result.current.previewOffsetMs;

    act(() => result.current.bind.onPointerDown(pointerEvent(90, target)));
    act(() => result.current.bind.onPointerMove(pointerEvent(135, target)));

    expect(result.current.previewOffsetMs).toBeCloseTo(afterFirstDrag + (45 / 15) * MS_PER_HOUR);
  });

  it('ignores pointermove before any pointerdown', () => {
    const { result } = renderHook(() => useRingScrub());
    const target = fakeTarget();

    act(() => result.current.bind.onPointerMove(pointerEvent(90, target)));

    expect(result.current.previewOffsetMs).toBe(0);
    expect(result.current.isDragging).toBe(false);
  });

  it('steps by exactly one minute per ArrowRight/ArrowLeft press', () => {
    const { result } = renderHook(() => useRingScrub());
    const preventDefault = vi.fn();
    const oneMinuteMs = MS_PER_HOUR / 60;

    act(() =>
      result.current.bind.onKeyDown({ key: 'ArrowRight', preventDefault } as unknown as Parameters<
        ReturnType<typeof useRingScrub>['bind']['onKeyDown']
      >[0]),
    );
    expect(result.current.previewOffsetMs).toBe(oneMinuteMs);

    act(() =>
      result.current.bind.onKeyDown({ key: 'ArrowLeft', preventDefault } as unknown as Parameters<
        ReturnType<typeof useRingScrub>['bind']['onKeyDown']
      >[0]),
    );
    expect(result.current.previewOffsetMs).toBe(0);
    expect(preventDefault).toHaveBeenCalledTimes(2);
  });

  it('steps by exactly one hour per ArrowUp/ArrowDown press', () => {
    const { result } = renderHook(() => useRingScrub());
    const preventDefault = vi.fn();

    act(() =>
      result.current.bind.onKeyDown({ key: 'ArrowUp', preventDefault } as unknown as Parameters<
        ReturnType<typeof useRingScrub>['bind']['onKeyDown']
      >[0]),
    );
    expect(result.current.previewOffsetMs).toBe(MS_PER_HOUR);

    act(() =>
      result.current.bind.onKeyDown({ key: 'ArrowDown', preventDefault } as unknown as Parameters<
        ReturnType<typeof useRingScrub>['bind']['onKeyDown']
      >[0]),
    );
    expect(result.current.previewOffsetMs).toBe(0);
    expect(preventDefault).toHaveBeenCalledTimes(2);
  });

  it('reset() clears the offset back to zero', () => {
    const { result } = renderHook(() => useRingScrub());
    const target = fakeTarget();

    act(() => result.current.bind.onPointerDown(pointerEvent(0, target)));
    act(() => result.current.bind.onPointerMove(pointerEvent(90, target)));
    act(() => result.current.reset());

    expect(result.current.previewOffsetMs).toBe(0);
  });

  it('setOffsetMs() sets the offset directly, independent of any drag in progress', () => {
    const { result } = renderHook(() => useRingScrub());

    act(() => result.current.setOffsetMs(5 * MS_PER_HOUR));

    expect(result.current.previewOffsetMs).toBe(5 * MS_PER_HOUR);
  });
});
