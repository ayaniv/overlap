import type { Point } from './geometry';
import type { Location } from './types';
import styles from './RingIncludeCheckbox.module.css';

export type RingIncludeCheckboxProps = {
  location: Location;
  dotPosition: Point;
  checked: boolean;
  disabled: boolean;
  // shown as a hover tooltip when disabled — required whenever disabled is
  // true, since a disabled control with no explanation is exactly the
  // silent-failure problem this prop exists to avoid
  disabledReason?: string;
  onToggle: () => void;
};

// geometry.ts's coordinates live in the SVG viewBox's 0-1000 space; CSS
// left/top percentages want 0-100 — mirrors ScrubHint.tsx's same conversion
const VIEWBOX_UNITS_PER_PERCENT = 10;

// sits at the ring's existing dot anchor — the fixed point (always at angle
// 0, so it never moves as the clock scrubs) between the curved name and time
// labels, already computed by WorldClock's ringViews. Reuses that exact
// geometry instead of measuring label text width, per the visual-companion
// mockup comparison during brainstorming (docs/superpowers/specs/2026-07-20-
// find-meeting-time-design.md).
export function RingIncludeCheckbox({ location, dotPosition, checked, disabled, disabledReason, onToggle }: RingIncludeCheckboxProps) {
  return (
    <label
      className={styles.checkboxWrap}
      style={
        {
          '--checkbox-left': `${dotPosition.x / VIEWBOX_UNITS_PER_PERCENT}%`,
          '--checkbox-top': `${dotPosition.y / VIEWBOX_UNITS_PER_PERCENT}%`,
        } as React.CSSProperties
      }
      // native tooltip explaining why a disabled checkbox can't be checked —
      // on the label (not just the input) so hovering anywhere in the click
      // target shows it
      title={disabled ? disabledReason : undefined}
      // this sits inside .clockContainer, which has useRingScrub's onPointerDown
      // bound for drag-to-scrub — that handler calls setPointerCapture on the
      // container unconditionally, so without stopping propagation here every
      // click on this checkbox gets hijacked into a scrub-drag gesture instead
      // of toggling: the container captures the pointer before the browser's
      // native mouseup/click ever completes on the input, so the checkbox
      // visually never (un)checks.
      onPointerDown={(event) => event.stopPropagation()}
    >
      <input
        type="checkbox"
        className={styles.checkboxInput}
        data-testid={`ring-include-checkbox-${location.id}`}
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        aria-label={`Include ${location.label} in Find Time search`}
      />
    </label>
  );
}
