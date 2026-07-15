import { useEffect } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
export const SCRUB_HINT_AMPLITUDE_MS = 90 * 60_000; // +/-90 minutes
export const SCRUB_HINT_PERIOD_MS = 2_500; // one full back-and-forth sweep

export type UseScrubHintDemoParams = {
  active: boolean;
  setOffsetMs: (ms: number) => void;
};

// drives useRingScrub's real setOffsetMs in a smooth sine sweep while
// `active`, so the hint's demo animates the actual clock rendering (rings,
// center time, meeting dots) rather than a decorative copy of it. Skips
// entirely under prefers-reduced-motion: reduce, matching useSweepAngle.ts.
export function useScrubHintDemo({ active, setOffsetMs }: UseScrubHintDemoParams): void {
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return;

    let frameId: number;
    const startTime = Date.now();
    const tick = () => {
      const elapsedMs = Date.now() - startTime;
      const phase = (elapsedMs / SCRUB_HINT_PERIOD_MS) * 2 * Math.PI;
      setOffsetMs(SCRUB_HINT_AMPLITUDE_MS * Math.sin(phase));
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [active, setOffsetMs]);
}
