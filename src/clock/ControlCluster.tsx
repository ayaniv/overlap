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
      <button type="button" className={styles.button} onClick={onShare}>
        Share
      </button>
    </div>
  );
});
