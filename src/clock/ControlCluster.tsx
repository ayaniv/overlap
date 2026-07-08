import { memo } from 'react';
import CogwheelIcon from './icons/cogwheel.svg?react';
import ScheduleIcon from './icons/schedule.svg?react';
import ShareIcon from './icons/share.svg?react';
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
        className={mode === 'edit' ? styles.iconButtonActive : styles.iconButton}
        aria-pressed={mode === 'edit'}
        aria-label="Config"
        title="Config"
        onClick={() => toggleMode('edit')}
      >
        <CogwheelIcon />
      </button>
      <button
        type="button"
        className={mode === 'schedule' ? styles.iconButtonActive : styles.iconButton}
        aria-pressed={mode === 'schedule'}
        onClick={() => toggleMode('schedule')}
        aria-label="Schedule"
        title="Schedule"
      >
        <ScheduleIcon />
      </button>
      <button type="button" className={styles.iconButton} onClick={onShare} aria-label="Share" title="Share">
        <ShareIcon />
      </button>
    </div>
  );
});
