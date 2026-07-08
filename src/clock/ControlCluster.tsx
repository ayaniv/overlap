import { memo } from 'react';
import type { Mode } from './types';
import styles from './ControlCluster.module.css';

export type ControlClusterProps = {
  mode: Mode;
  onSetMode: (mode: Mode) => void;
  onShare: () => void;
};

// top-right entry points for edit/schedule modes + share; the mode panel and
// share behavior are wired up by the caller behind these same callbacks
//
// memoized because it doesn't receive `now`: without this it re-renders every
// second along with WorldClock's once-a-second tick, for no visual benefit
export const ControlCluster = memo(function ControlCluster({ mode, onSetMode, onShare }: ControlClusterProps) {
  const toggleMode = (target: Mode) => onSetMode(mode === target ? 'view' : target);

  return (
    <div className={styles.cluster}>
      <button
        type="button"
        className={mode === 'edit' ? styles.buttonActive : styles.button}
        aria-pressed={mode === 'edit'}
        onClick={() => toggleMode('edit')}
      >
        Edit
      </button>
      <button
        type="button"
        className={mode === 'schedule' ? styles.buttonActive : styles.button}
        aria-pressed={mode === 'schedule'}
        onClick={() => toggleMode('schedule')}
      >
        Schedule
      </button>
      <button type="button" className={styles.iconButton} onClick={onShare} aria-label="Share" title="Share">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </button>
    </div>
  );
});
