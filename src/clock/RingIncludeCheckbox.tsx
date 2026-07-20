import type { Point } from './geometry';
import type { Location } from './types';
import styles from './RingIncludeCheckbox.module.css';

export type RingIncludeCheckboxProps = {
  location: Location;
  dotPosition: Point;
  checked: boolean;
  disabled: boolean;
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
export function RingIncludeCheckbox({ location, dotPosition, checked, disabled, onToggle }: RingIncludeCheckboxProps) {
  return (
    <label
      className={styles.checkboxWrap}
      style={
        {
          '--checkbox-left': `${dotPosition.x / VIEWBOX_UNITS_PER_PERCENT}%`,
          '--checkbox-top': `${dotPosition.y / VIEWBOX_UNITS_PER_PERCENT}%`,
        } as React.CSSProperties
      }
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
