import { useEffect } from 'react';
import type { RefObject } from 'react';
import { CENTER, handAngle } from './geometry';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const REDUCED_MOTION_INTERVAL_MS = 1000;

// Drives a clockwise rotation of exactly one full turn per 60 seconds by writing the SVG
// transform directly to the DOM, entirely independent of React re-renders. This hook must be
// the *only* thing that ever sets this attribute: the caller must not also bind it to a
// reactive `transform` prop (e.g. off the app's once-a-second `now` state) — that re-render
// would clobber whatever frame-accurate angle was just written here, producing a once-a-second
// stutter that's most visible right at the 12 o'clock mark, the one point on the dial with a
// fixed reference (the triangle marker) to expose the misalignment against. Under
// prefers-reduced-motion this ticks once a second instead of animating continuously, but still
// owns the attribute itself for the same reason.
export function useSweepAngle(elementRef: RefObject<SVGGElement | null>): void {
  useEffect(() => {
    const setAngle = () => {
      const node = elementRef.current;
      if (node) {
        node.setAttribute('transform', `rotate(${handAngle(new Date()).toFixed(3)} ${CENTER} ${CENTER})`);
      }
    };

    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      setAngle();
      const id = setInterval(setAngle, REDUCED_MOTION_INTERVAL_MS);
      return () => clearInterval(id);
    }

    let frameId: number;
    const tick = () => {
      setAngle();
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [elementRef]);
}
