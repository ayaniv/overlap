import { useEffect } from 'react';
import type { RefObject } from 'react';
import { CENTER } from './geometry';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// Drives a clockwise rotation of exactly one full turn per 60 seconds by writing
// the SVG transform directly to the DOM every animation frame, bypassing React
// re-renders so the sweep stays smooth regardless of the app's once-a-second tick.
export function useSweepAngle(elementRef: RefObject<SVGGElement | null>): void {
  useEffect(() => {
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return;

    let frameId: number;
    const tick = () => {
      const node = elementRef.current;
      if (node) {
        const angle = ((Date.now() % 60000) / 60000) * 360;
        node.setAttribute('transform', `rotate(${angle.toFixed(3)} ${CENTER} ${CENTER})`);
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [elementRef]);
}
