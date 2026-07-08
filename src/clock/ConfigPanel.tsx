import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronIcon } from './icons/ChevronIcon';
import styles from './ConfigPanel.module.css';

export type ConfigPanelProps = {
  addLocationContent: ReactNode;
  manageLocationsContent: ReactNode;
};

type Section = 'add' | 'manage';

// wraps AddLocationForm and ManageLocationsList as a two-section accordion so
// only one section (and its own CTA) is visible at a time, instead of both
// stacked with competing buttons; defaults to Add location
export function ConfigPanel({ addLocationContent, manageLocationsContent }: ConfigPanelProps) {
  const [activeSection, setActiveSection] = useState<Section>('add');

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <button
          type="button"
          className={styles.sectionHeader}
          aria-expanded={activeSection === 'add'}
          onClick={() => setActiveSection('add')}
        >
          Add location
          <ChevronIcon className={activeSection === 'add' ? styles.chevronOpen : styles.chevron} />
        </button>
        {activeSection === 'add' && <div className={styles.sectionBody}>{addLocationContent}</div>}
      </div>
      <div className={styles.section}>
        <button
          type="button"
          className={styles.sectionHeader}
          aria-expanded={activeSection === 'manage'}
          onClick={() => setActiveSection('manage')}
        >
          Manage locations
          <ChevronIcon className={activeSection === 'manage' ? styles.chevronOpen : styles.chevron} />
        </button>
        {activeSection === 'manage' && <div className={styles.sectionBody}>{manageLocationsContent}</div>}
      </div>
    </div>
  );
}
