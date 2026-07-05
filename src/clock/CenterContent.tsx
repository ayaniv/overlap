import type { ReactNode } from 'react';
import type { Mode } from './types';
import styles from './CenterContent.module.css';

const MODE_PLACEHOLDER_LABEL: Record<Exclude<Mode, 'view'>, string> = {
  edit: 'Edit locations',
  schedule: 'Schedule a meeting',
};

export type CenterContentProps = {
  mode: Mode;
  homeLabel: string;
  homeTimeLabel: string;
  homeDateLabel: string;
  override?: ReactNode;
};

// owns the mode-driven content shown in the glass disc: the home clock in view
// mode, or the edit/schedule slot (M2/M4 pass `override`; a placeholder shows
// until they do) — kept as its own component so WorldClock doesn't have to
// branch on mode inline
export function CenterContent({ mode, homeLabel, homeTimeLabel, homeDateLabel, override }: CenterContentProps) {
  if (mode === 'view') {
    return (
      <>
        <div className={styles.centerLocalLabel}>{homeLabel.toUpperCase()}</div>
        <div className={styles.centerTime}>{homeTimeLabel}</div>
        <div className={styles.centerDate}>{homeDateLabel}</div>
      </>
    );
  }

  return override ?? <div className={styles.centerPlaceholder}>{MODE_PLACEHOLDER_LABEL[mode]}</div>;
}
