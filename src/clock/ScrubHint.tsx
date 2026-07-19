// src/clock/ScrubHint.tsx
import { DEGREES_PER_HOUR, MS_PER_HOUR, pointOnCircle, ringRadius } from './geometry';
import { ANGLE_REST_DEG } from './useScrubHintDemo';
import styles from './ScrubHint.module.css';

export type ScrubHintProps = {
  offsetMs: number;
  totalRings: number;
  onDismiss: () => void;
  // true from the moment "Got it" is clicked until the clock finishes
  // animating back to now — the tooltip leaves immediately, the hand rides back
  isDismissing?: boolean;
};

export const HINT_TEXT = 'Find an overlap to schedule a meeting';
// the hand starts from the clock's current real position, goes 5h forward
// then eases back 2h to ANGLE_REST_DEG — the tooltip sits at that same
// import (rather than a re-declared literal) so the two can't drift apart
const TOOLTIP_ANCHOR_DEG = ANGLE_REST_DEG;

// geometry.ts's coordinates live in the SVG viewBox's 0-1000 space; CSS
// left/top percentages want 0-100 — this converts between the two
const VIEWBOX_UNITS_PER_PERCENT = 10;

// hand rides between the 3rd and 4th ring from the outside (clamped so it
// still makes sense with fewer rings) rather than out past the bezel.
const HAND_RADIUS_OUTER_RING_INDEX = 2;
const HAND_RADIUS_INNER_RING_INDEX = 3;
function handRadius(totalRings: number): number {
  const clamp = (index: number) => Math.max(0, Math.min(totalRings - 1, index));
  return (ringRadius(clamp(HAND_RADIUS_OUTER_RING_INDEX), totalRings) + ringRadius(clamp(HAND_RADIUS_INNER_RING_INDEX), totalRings)) / 2;
}

// overlays the clock face with a scrim, an animated hand tracking the live
// offsetMs (driven by useScrubHintDemo's forward-then-partial-reverse
// sweep), riding between rings rather than out past the bezel, and a
// tooltip fading in at the hand's fixed rest position (see
// ScrubHint.module.css — also overridden for portrait/mobile there).
export function ScrubHint({ offsetMs, totalRings, onDismiss, isDismissing = false }: ScrubHintProps) {
  const angleDeg = (offsetMs / MS_PER_HOUR) * DEGREES_PER_HOUR;
  const radius = handRadius(totalRings);
  const handPoint = pointOnCircle(radius, angleDeg);
  const tooltipPoint = pointOnCircle(radius, TOOLTIP_ANCHOR_DEG);

  return (
    <div className={styles.overlay} data-testid="scrub-hint-overlay" data-dismissing={isDismissing || undefined}>
      <span
        className={styles.hand}
        data-testid="scrub-hint-hand"
        style={
          {
            '--hint-hand-left': `${handPoint.x / VIEWBOX_UNITS_PER_PERCENT}%`,
            '--hint-hand-top': `${handPoint.y / VIEWBOX_UNITS_PER_PERCENT}%`,
          } as React.CSSProperties
        }
        aria-hidden="true"
      >
        👆
      </span>
      <div
        className={isDismissing ? `${styles.tooltip} ${styles.tooltipLeaving}` : styles.tooltip}
        style={
          {
            '--hint-tooltip-left': `${tooltipPoint.x / VIEWBOX_UNITS_PER_PERCENT}%`,
            '--hint-tooltip-top': `${tooltipPoint.y / VIEWBOX_UNITS_PER_PERCENT}%`,
          } as React.CSSProperties
        }
      >
        <p className={styles.text} data-testid="scrub-hint-text">
          {HINT_TEXT}
        </p>
        <button type="button" className={styles.button} data-testid="scrub-hint-dismiss-button" onClick={onDismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
