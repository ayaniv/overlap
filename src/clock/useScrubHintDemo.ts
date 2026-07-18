import { useEffect } from 'react';
import { offsetMsFromAngle } from './geometry';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// two-phase demo, both eased in-and-out so velocity is continuous at the
// reversal point (like a pendulum pausing at its apex, not a hard stop-and-
// restart) — the earlier 3-segment version had a velocity discontinuity at
// the phase 2/3 boundary that read as "fragmented". Hand position is always
// computed via pointOnCircle at a constant radius, so it already traces the
// clock's circle exactly; this only smooths its speed along that arc.
const ANGLE_START_DEG = 0; // current real position ("now") — not a fixed clock-face spot
const ANGLE_PEAK_DEG = 75; // +5h forward from the start
export const ANGLE_REST_DEG = 45; // 2h back from the peak; ScrubHint imports this for its tooltip anchor

const PHASE_1_MS = 3_600; // 0 -> +5h
const PHASE_2_MS = 1_800; // +5h -> +3h
export const SCRUB_HINT_PERIOD_MS = PHASE_1_MS + PHASE_2_MS;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function angleAt(elapsedMs: number): number {
  if (elapsedMs < PHASE_1_MS) {
    const t = elapsedMs / PHASE_1_MS;
    return ANGLE_START_DEG + (ANGLE_PEAK_DEG - ANGLE_START_DEG) * easeInOutCubic(t);
  }
  const t = Math.min((elapsedMs - PHASE_1_MS) / PHASE_2_MS, 1);
  return ANGLE_PEAK_DEG + (ANGLE_REST_DEG - ANGLE_PEAK_DEG) * easeInOutCubic(t);
}

export type UseScrubHintDemoParams = {
  active: boolean;
  setOffsetMs: (ms: number) => void;
};

// plays the forward-then-partial-reverse sweep once, then holds at the rest
// position — does not loop. The hint stays visible (App.tsx controls that
// separately via `active`/isScrubHintVisible); only the demo motion is one-shot.
// Under prefers-reduced-motion, the demo doesn't run at all (never touches
// setOffsetMs), matching useSweepAngle.ts's precedent.
export function useScrubHintDemo({ active, setOffsetMs }: UseScrubHintDemoParams): void {
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return;

    let frameId: number | undefined;
    const startTime = Date.now();
    const tick = () => {
      const elapsedMs = Date.now() - startTime;
      setOffsetMs(offsetMsFromAngle(angleAt(Math.min(elapsedMs, SCRUB_HINT_PERIOD_MS))));
      if (elapsedMs >= SCRUB_HINT_PERIOD_MS) return;
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      if (frameId !== undefined) cancelAnimationFrame(frameId);
    };
  }, [active, setOffsetMs]);
}
