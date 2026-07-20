import { useEffect, useRef } from 'react';
import { easedBetween } from './easing';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
export const FIND_MEETING_TIME_SWEEP_MS = 600;

export type UseFindMeetingTimeSweepParams = {
  active: boolean;
  fromOffsetMs: number;
  toOffsetMs: number;
  setOffsetMs: (ms: number) => void;
  onComplete: () => void;
};

// eases previewOffsetMs from wherever it sits when triggered to an arbitrary
// target — modeled directly on useScrubHintReturn.ts (same easedBetween, same
// duration convention), generalized to any target instead of always 0.
export function useFindMeetingTimeSweep({ active, fromOffsetMs, toOffsetMs, setOffsetMs, onComplete }: UseFindMeetingTimeSweepParams): void {
  const latestFromOffsetMs = useRef(fromOffsetMs);
  latestFromOffsetMs.current = fromOffsetMs;
  const latestToOffsetMs = useRef(toOffsetMs);
  latestToOffsetMs.current = toOffsetMs;
  const latestOnComplete = useRef(onComplete);
  latestOnComplete.current = onComplete;

  useEffect(() => {
    if (!active) return;

    const targetOffsetMs = latestToOffsetMs.current;

    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      setOffsetMs(targetOffsetMs);
      latestOnComplete.current();
      return;
    }

    const startOffsetMs = latestFromOffsetMs.current;
    const startTime = Date.now();
    const tick = () => {
      const elapsedMs = Math.min(Date.now() - startTime, FIND_MEETING_TIME_SWEEP_MS);
      setOffsetMs(easedBetween(startOffsetMs, targetOffsetMs, elapsedMs / FIND_MEETING_TIME_SWEEP_MS));
      if (elapsedMs < FIND_MEETING_TIME_SWEEP_MS) {
        frameId = requestAnimationFrame(tick);
        return;
      }
      latestOnComplete.current();
    };
    let frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [active, setOffsetMs]);
}
