import type { ReactNode } from 'react';
import styles from './MobileConfigView.module.css';

export type MobileConfigViewProps = {
  addLocationContent: ReactNode;
  manageLocationsContent: ReactNode;
  onClose: () => void;
};

// mobile-only replacement for the desktop floating ConfigPanel (see WorldClock.tsx):
// a real full-screen, normally-scrolling page instead of a `position: absolute`
// overlay clipped by the stage's `overflow: hidden` — the old panel had no scroll
// container of its own, so the on-screen keyboard (opening on the city-search tap)
// could push Add/Cancel and the whole Manage-locations section off-screen with no
// way to reach them. Shows both sections stacked rather than behind an accordion
// tab, since a real page has no space pressure forcing that trade-off.
export function MobileConfigView({ addLocationContent, manageLocationsContent, onClose }: MobileConfigViewProps) {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <span className={styles.title} data-testid="mobile-config-title">
          Manage clock
        </span>
        <button type="button" className={styles.doneButton} data-testid="mobile-config-done" onClick={onClose}>
          Done
        </button>
      </div>
      <div className={styles.body}>
        <section className={styles.section}>
          <h2 className={styles.sectionHeading} data-testid="mobile-add-location-heading">
            Add location
          </h2>
          <div data-testid="mobile-add-location-body">{addLocationContent}</div>
        </section>
        <section className={styles.section}>
          <h2 className={styles.sectionHeading} data-testid="mobile-manage-locations-heading">
            Manage locations
          </h2>
          <div data-testid="mobile-manage-locations-body">{manageLocationsContent}</div>
        </section>
      </div>
    </div>
  );
}
