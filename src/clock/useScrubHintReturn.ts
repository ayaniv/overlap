import { useEffect, useRef } from 'react';
import { easedBetween } from './easing';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export const SCRUB_HINT_RETURN_MS = 600;

export type UseScrubHintReturnParams = {
  active: boolean;
  fromOffsetMs: number;
  setOffsetMs: (ms: number) => void;
  onComplete: () => void;
};

// eases the scrub preview from wherever the hand is back to "now" when the
// user dismisses the hint, instead of snapping there in a single frame.
export function useScrubHintReturn({ active, fromOffsetMs, setOffsetMs, onComplete }: UseScrubHintReturnParams): void {
  // this hook drives previewOffsetMs itself, so fromOffsetMs must not be a
  // dependency of the animation effect — re-reading it each render would
  // restart the animation from its own output on every frame. The ref mirrors
  // the latest prop; the effect snapshots it once, when `active` flips true.
  const latestFromOffsetMs = useRef(fromOffsetMs);
  latestFromOffsetMs.current = fromOffsetMs;
  // likewise kept in a ref so an unstable onComplete identity can't restart
  // the animation mid-flight
  const latestOnComplete = useRef(onComplete);
  latestOnComplete.current = onComplete;

  useEffect(() => {
    if (!active) return;

    // under reduced motion the demo sweep never ran, so the offset is already
    // at now and there's nothing to animate back — dismiss straight away,
    // matching useScrubHintDemo's precedent of bailing out entirely
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      setOffsetMs(0);
      latestOnComplete.current();
      return;
    }

    const startOffsetMs = latestFromOffsetMs.current;
    const startTime = Date.now();
    const tick = () => {
      const elapsedMs = Math.min(Date.now() - startTime, SCRUB_HINT_RETURN_MS);
      setOffsetMs(easedBetween(startOffsetMs, 0, elapsedMs / SCRUB_HINT_RETURN_MS));
      if (elapsedMs < SCRUB_HINT_RETURN_MS) {
        frameId = requestAnimationFrame(tick);
        return;
      }
      latestOnComplete.current();
    };
    let frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [active, setOffsetMs]);
}
