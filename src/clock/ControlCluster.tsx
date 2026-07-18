import { memo } from 'react';
import { CloseIcon } from './icons/CloseIcon';
import { CogwheelIcon } from './icons/CogwheelIcon';
import { MenuIcon } from './icons/MenuIcon';
import { ShareIcon } from './icons/ShareIcon';
import { TrashIcon } from './icons/TrashIcon';
import type { Mode } from './types';
import styles from './ControlCluster.module.css';

export type ScrubActions = {
  onSchedule: () => void;
  onCancel: () => void;
  isScheduling: boolean;
  // present only when the scrub preview lands on an already-scheduled meeting
  // (see App.tsx's matchedMeeting) — an extra, third action alongside Cancel/
  // Schedule rather than replacing either of them
  matchedMeeting?: {
    onRemove: () => void;
    isRemoving: boolean;
  };
};

export type ControlClusterProps = {
  mode: Mode;
  onSetMode: (mode: Mode) => void;
  onShare: () => void;
  // controlled rather than local state: starting a scrub (App.tsx) forces this
  // open even if the user never clicked the toggle, so the newly-revealed
  // scrub actions aren't hidden behind a still-collapsed menu
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  // when set (any scrub preview, see WorldClock's isScrubActionBarVisible),
  // replaces the Config/Share icon menu with Cancel/Schedule(/Remove Meeting) —
  // a time-sensitive contextual action that shouldn't hide behind the
  // collapsed-menu interaction the icon row otherwise uses. Scheduling itself
  // is instant (see App.tsx's handleQuickSchedule) — there's no separate
  // schedule-mode/form to enter anymore, on either desktop or mobile.
  scrubActions?: ScrubActions;
};

// top-right entry points for edit mode + share; the mode panel and share
// behavior are wired up by the caller behind these same callbacks. Scheduling
// has no icon/mode of its own — see scrubActions below.
//
// Starts collapsed behind a single round toggle button (hamburger icon at rest,
// cross-fading to an X when open — see the CSS comment on .hamburgerIcon/.closeIcon
// for why this is a fade+scale swap rather than rotating the hamburger lines into
// an X) — clicking it pulls the action buttons out from behind the toggle
// (small scale+slide, with a slight overshoot for a subtle "pulse" landing)
// instead of a large translate; clicking again reverses it.
// `tabIndex={-1}` on the collapsed actions keeps them out of the tab order
// (they're also `pointer-events: none` in CSS) without removing them from the
// DOM, so the transition plays instead of them just popping in.
//
// memoized because it doesn't receive `now`: without this it re-renders every
// second along with WorldClock's once-a-second tick, for no visual benefit
export const ControlCluster = memo(function ControlCluster({ mode, onSetMode, onShare, isExpanded, onExpandedChange, scrubActions }: ControlClusterProps) {
  const toggleMode = (target: Mode) => onSetMode(mode === target ? 'view' : target);
  const actionTabIndex = isExpanded ? 0 : -1;

  // closing the cluster (via the X) also dismisses the Config panel if it's
  // open — collapsing the entry points but leaving a panel open behind them
  // would be a dead end with no visible way back
  const handleToggleClick = () => {
    const isNowExpanded = !isExpanded;
    onExpandedChange(isNowExpanded);
    if (!isNowExpanded) onSetMode('view');
  };

  if (scrubActions) {
    return (
      <div className={styles.cluster} data-scrub-mode="true">
        {scrubActions.matchedMeeting ? (
          // landing on an existing meeting replaces Cancel/Schedule entirely, rather
          // than adding a third button alongside them — removing it is the only
          // scrub-specific action that makes sense here (scrubbing elsewhere is
          // already how you back out without removing anything)
          <button
            type="button"
            className={styles.scrubRemoveMeetingButton}
            data-testid="control-remove-meeting-button"
            onClick={scrubActions.matchedMeeting.onRemove}
            disabled={scrubActions.matchedMeeting.isRemoving}
          >
            <TrashIcon isOpen={scrubActions.matchedMeeting.isRemoving} />
            {scrubActions.matchedMeeting.isRemoving ? 'Removing…' : 'Remove Meeting'}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={styles.scrubCancelButton}
              data-testid="control-scrub-cancel-button"
              onClick={scrubActions.onCancel}
              disabled={scrubActions.isScheduling}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.scrubScheduleButton}
              data-testid="control-scrub-schedule-button"
              onClick={scrubActions.onSchedule}
              disabled={scrubActions.isScheduling}
            >
              {scrubActions.isScheduling ? 'Scheduling…' : 'Schedule'}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={styles.cluster} data-expanded={isExpanded || undefined}>
      <div className={styles.actions}>
        <button
          type="button"
          tabIndex={actionTabIndex}
          className={mode === 'edit' ? styles.iconButtonActive : styles.iconButton}
          aria-pressed={mode === 'edit'}
          aria-label="Config"
          title="Config"
          data-testid="control-config-button"
          onClick={() => toggleMode('edit')}
        >
          <CogwheelIcon />
        </button>
        <button
          type="button"
          tabIndex={actionTabIndex}
          className={styles.iconButton}
          onClick={onShare}
          aria-label="Share"
          title="Share"
          data-testid="control-share-button"
        >
          <ShareIcon />
        </button>
      </div>

      <button
        type="button"
        className={styles.toggle}
        aria-expanded={isExpanded}
        aria-label="Menu"
        data-testid="control-menu-toggle"
        onClick={handleToggleClick}
      >
        {/* cross-fades between two static glyphs instead of rotating the hamburger
            lines into an X: rotating+translating each line toward a shared center
            interpolates its rotation angle and position independently, so at the
            midpoint the lines visibly bow off to one side before settling — a
            plain opacity/scale swap has no such in-between shape. */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <MenuIcon className={styles.hamburgerIcon} />
          <CloseIcon className={styles.closeIcon} />
        </svg>
      </button>
    </div>
  );
});
