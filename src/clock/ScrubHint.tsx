// src/clock/ScrubHint.tsx
import { DEGREES_PER_HOUR, MS_PER_HOUR, pointOnCircle, ringRadius } from './geometry';
import styles from './ScrubHint.module.css';

export type ScrubHintProps = {
  offsetMs: number;
  totalRings: number;
  onDismiss: () => void;
};

const HINT_TEXT = 'Find an overlap to schedule a meeting';
// must match useScrubHintDemo's ANGLE_REST_DEG — the hand starts from the
// clock's current real position, goes 5h forward then eases back 2h to this
// exact spot, so the tooltip sits right where the hand ends up
const TOOLTIP_ANCHOR_DEG = 45;

// hand rides between the 3rd and 4th ring from the outside (clamped so it
// still makes sense with fewer rings) rather than out past the bezel.
function handRadius(totalRings: number): number {
  const clamp = (index: number) => Math.max(0, Math.min(totalRings - 1, index));
  return (ringRadius(clamp(2), totalRings) + ringRadius(clamp(3), totalRings)) / 2;
}

// overlays the clock face with a scrim, an animated hand tracking the live
// offsetMs (driven by useScrubHintDemo's forward-then-partial-reverse
// sweep), riding between rings rather than out past the bezel, and a
// tooltip fading in at the hand's fixed rest position (see
// ScrubHint.module.css — also overridden for portrait/mobile there).
export function ScrubHint({ offsetMs, totalRings, onDismiss }: ScrubHintProps) {
  const angleDeg = (offsetMs / MS_PER_HOUR) * DEGREES_PER_HOUR;
  const radius = handRadius(totalRings);
  const handPoint = pointOnCircle(radius, angleDeg);
  const tooltipPoint = pointOnCircle(radius, TOOLTIP_ANCHOR_DEG);

  return (
    <div className={styles.overlay}>
      <span
        className={styles.hand}
        style={{ left: `${handPoint.x / 10}%`, top: `${handPoint.y / 10}%` }}
        aria-hidden="true"
      >
        👆
      </span>
      <div className={styles.tooltip} style={{ left: `${tooltipPoint.x / 10}%`, top: `${tooltipPoint.y / 10}%` }}>
        <p className={styles.text}>{HINT_TEXT}</p>
        <button type="button" className={styles.button} onClick={onDismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
