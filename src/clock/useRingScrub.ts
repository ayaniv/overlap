import { useCallback, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { MS_PER_HOUR, angleDelta, angleFromCenterOffset, offsetMsFromAngle } from './geometry';

// Up/Down step by a minute; holding Shift steps by an hour instead, so
// keyboard-only users get both granularities off the same pair of keys. This
// diverges from the ARIA APG slider convention (all four arrows stepping
// equally, no modifier) — see WorldClock.tsx's aria-label for the accompanying
// screen-reader note. Left/Right are intentionally unbound.
const ARROW_MINUTE_STEP_MS = MS_PER_HOUR / 60;
const ARROW_HOUR_STEP_MS = MS_PER_HOUR;

export type RingScrubBind = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
};

export type UseRingScrubResult = {
  previewOffsetMs: number;
  isDragging: boolean;
  reset: () => void;
  setOffsetMs: (ms: number) => void;
  bind: RingScrubBind;
};

function angleFromClientPoint(centerX: number, centerY: number, clientX: number, clientY: number): number {
  return angleFromCenterOffset(clientX - centerX, clientY - centerY);
}

// lets the user drag anywhere on the clock face to preview a different meeting time:
// rotation maps to a time offset at 15deg/hour (DEGREES_PER_HOUR), so `now + previewOffsetMs`
// can be rendered by the clock as the previewed instant. Up/Down step by a minute
// (Shift+Up/Down by an hour), so the same preview is reachable — at either
// granularity — without a pointer.
export function useRingScrub(): UseRingScrubResult {
  const [previewOffsetMs, setPreviewOffsetMs] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // the clock face doesn't move mid-drag, so the bounding rect is read once on
  // pointerdown and reused for every pointermove, instead of forcing a layout
  // reflow on every move event. `angle` tracks the *last* sample, not the drag's
  // start — angleDelta only returns a value in (-180, 180], so measuring every
  // move against a fixed start angle would snap backwards the moment a continuous
  // drag swept more than half a turn away from where it began. Measuring against
  // the previous sample instead keeps each step small enough that the shortest-path
  // wrap is always the correct (and only) interpretation, so multi-turn drags
  // accumulate correctly.
  const dragStart = useRef<{ centerX: number; centerY: number; angle: number } | null>(null);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    dragStart.current = { centerX, centerY, angle: angleFromClientPoint(centerX, centerY, event.clientX, event.clientY) };
    setIsDragging(true);
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!dragStart.current) return;
    const { centerX, centerY, angle: lastAngle } = dragStart.current;
    const angle = angleFromClientPoint(centerX, centerY, event.clientX, event.clientY);
    const delta = angleDelta(lastAngle, angle);
    dragStart.current.angle = angle;
    setPreviewOffsetMs((ms) => ms + offsetMsFromAngle(delta));
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStart.current = null;
    setIsDragging(false);
  }, []);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const stepMs = event.shiftKey ? ARROW_HOUR_STEP_MS : ARROW_MINUTE_STEP_MS;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setPreviewOffsetMs((ms) => ms + stepMs);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setPreviewOffsetMs((ms) => ms - stepMs);
    }
  }, []);

  const reset = useCallback(() => setPreviewOffsetMs(0), []);
  const setOffsetMs = useCallback((ms: number) => setPreviewOffsetMs(ms), []);

  const bind = useMemo<RingScrubBind>(
    () => ({ onPointerDown, onPointerMove, onPointerUp, onKeyDown }),
    [onPointerDown, onPointerMove, onPointerUp, onKeyDown],
  );

  return { previewOffsetMs, isDragging, reset, setOffsetMs, bind };
}
