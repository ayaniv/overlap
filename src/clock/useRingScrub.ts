import { useCallback, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { MS_PER_HOUR, angleDelta, angleFromCenterOffset, offsetMsFromAngle } from './geometry';

const ARROW_STEP_MS = MS_PER_HOUR;

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
// can be rendered by the clock as the previewed instant. Arrow keys step by one hour so the
// same preview is reachable without a pointer.
export function useRingScrub(): UseRingScrubResult {
  const [previewOffsetMs, setPreviewOffsetMs] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // the clock face doesn't move mid-drag, so the bounding rect is read once on
  // pointerdown and reused for every pointermove, instead of forcing a layout
  // reflow on every move event
  const dragStart = useRef<{ centerX: number; centerY: number; angle: number; offsetMs: number } | null>(null);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      const rect = event.currentTarget.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      dragStart.current = {
        centerX,
        centerY,
        angle: angleFromClientPoint(centerX, centerY, event.clientX, event.clientY),
        offsetMs: previewOffsetMs,
      };
      setIsDragging(true);
    },
    [previewOffsetMs],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!dragStart.current) return;
    const { centerX, centerY, angle: startAngle, offsetMs: startOffsetMs } = dragStart.current;
    const angle = angleFromClientPoint(centerX, centerY, event.clientX, event.clientY);
    const delta = angleDelta(startAngle, angle);
    setPreviewOffsetMs(startOffsetMs + offsetMsFromAngle(delta));
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStart.current = null;
    setIsDragging(false);
  }, []);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      setPreviewOffsetMs((ms) => ms + ARROW_STEP_MS);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      setPreviewOffsetMs((ms) => ms - ARROW_STEP_MS);
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
