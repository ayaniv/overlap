// src/clock/ScrubHint.tsx
import { DEGREES_PER_HOUR, MS_PER_HOUR, pointOnCircle, sweepHandOuterRadius } from './geometry';
import styles from './ScrubHint.module.css';

export type ScrubHintProps = {
  offsetMs: number;
  totalRings: number;
  onDismiss: () => void;
};

const HINT_TEXT = 'Find the right time to schedule a meeting';

// first-time-visitor hint: overlays the clock face with an animated hand
// tracking the same offsetMs the real ring preview uses (driven by
// useScrubHintDemo via App.tsx), so the demo shows the actual clock being
// scrubbed rather than a decorative copy. The caller (WorldClock.tsx)
// decides whether to mount this at all — it always renders its markup
// unconditionally, since "not shown" must mean "not in the DOM."
export function ScrubHint({ offsetMs, totalRings, onDismiss }: ScrubHintProps) {
  const angleDeg = (offsetMs / MS_PER_HOUR) * DEGREES_PER_HOUR;
  const handPoint = pointOnCircle(sweepHandOuterRadius(totalRings), angleDeg);

  return (
    <div className={styles.overlay}>
      <span
        className={styles.hand}
        style={{ left: `${handPoint.x / 10}%`, top: `${handPoint.y / 10}%` }}
        aria-hidden="true"
      >
        👆
      </span>
      <p className={styles.text}>{HINT_TEXT}</p>
      <button type="button" className={styles.button} onClick={onDismiss}>
        Got it
      </button>
    </div>
  );
}
