import { useEffect, useRef, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { usePostHog } from '@posthog/react';
import {
  DEFAULT_MEETING_DURATION_MINUTES,
  deleteMeetingFromGoogleCalendar,
  isGoogleCalendarConfigured,
  scheduleMeetingOnGoogleCalendar,
} from './googleCalendar';
import { parseMeetingInstant } from './geometry';
import {
  buildMeeting,
  formatDurationLabel,
  formatLocalTime,
  formatScheduledSummary,
  toDateInputValue,
  validateMeetingTitle,
  withDatePart,
} from './meetingForm';
import type { Meeting } from './types';
import styles from './ScheduleForm.module.css';

const AUTO_RETURN_DELAY_MS = 3000;

const SCRUB_GATE_TOOLTIP = 'Scrub the rings to pick a time';

const DURATION_OPTIONS_MINUTES = [15, 30, 45, 60];

export type ScheduleFormProps = {
  previewInstant: Date;
  onChangeInstant: (instant: Date) => void;
  existingMeetingIds: string[];
  onScheduled: (meeting: Meeting) => void;
  onCancel: () => void;
  // gated behind having scrubbed the rings at least once this visit — see App.tsx
  isEnabled: boolean;
  // set when the previewed instant lands on (within tolerance of) an already-scheduled
  // meeting — see findMeetingAtInstant in App.tsx
  matchedMeeting?: Meeting;
  onDeleteMeeting: (id: string) => void;
};

type Status = 'idle' | 'pending' | 'success' | 'error';
type DeleteStatus = 'idle' | 'pending' | 'error';

// opens the native calendar on click, not just on the small calendar-icon affordance a
// plain <input type="date"> otherwise requires
function handleWhenClick(event: MouseEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  if (typeof input.showPicker !== 'function') return;
  try {
    input.showPicker();
  } catch (err) {
    console.error('overlap: failed to open the native calendar', err);
  }
}

// renders inside the schedule-mode panel anchored next to the Schedule button: a title +
// a date picker for the day (kept in sync with the ring-drag preview via onChangeInstant;
// the time-of-day itself is read-only here — it's set by scrubbing, not typed), and a
// Google Calendar submit that's gated behind VITE_GOOGLE_CLIENT_ID being configured.
export function ScheduleForm({
  previewInstant,
  onChangeInstant,
  existingMeetingIds,
  onScheduled,
  onCancel,
  isEnabled,
  matchedMeeting,
  onDeleteMeeting,
}: ScheduleFormProps) {
  const posthog = usePostHog();
  const [title, setTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_MEETING_DURATION_MINUTES);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<DeleteStatus>('idle');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isConfigured = isGoogleCalendarConfigured();
  // guards against a stale result: Cancel doesn't (can't) abort an in-flight Google
  // sign-in/event-creation/event-deletion call itself — Google Identity Services
  // exposes no way to abort a popup mid-flow — but it does stop that stale result
  // from silently mutating local config or flipping the UI after the user has
  // already dismissed the panel
  const isCancelledRef = useRef(false);

  useEffect(() => {
    if (status !== 'success') return;
    const timer = setTimeout(onCancel, AUTO_RETURN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, onCancel]);

  // scrubbing to a different instant (or off the matched meeting entirely) drops
  // any delete-attempt state from the previous instant
  useEffect(() => {
    setDeleteStatus('idle');
    setDeleteError(null);
  }, [matchedMeeting?.id]);

  const handleCancel = () => {
    isCancelledRef.current = true;
    onCancel();
  };

  const handleDeleteMeeting = async () => {
    if (!matchedMeeting) return;
    setDeleteError(null);
    setDeleteStatus('pending');
    try {
      // a meeting with no googleEventId (pre-migration, or synced in from someone
      // else's share link) is still removable locally — just skip the Calendar call
      if (matchedMeeting.googleEventId) {
        await deleteMeetingFromGoogleCalendar(matchedMeeting.googleEventId);
      }
      if (isCancelledRef.current) return;
      onDeleteMeeting(matchedMeeting.id);
      posthog?.capture('meeting_deleted');
    } catch (err) {
      if (isCancelledRef.current) return;
      console.error('overlap: failed to delete the meeting', err);
      posthog?.captureException(err);
      setDeleteError(err instanceof Error ? err.message : 'Could not delete the meeting.');
      setDeleteStatus('error');
    }
  };

  const handleDateChange = (value: string) => {
    const instant = withDatePart(value, previewInstant);
    if (!instant) {
      console.error('overlap: could not parse the date input value', value);
      return;
    }
    onChangeInstant(instant);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateMeetingTitle(title);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setStatus('pending');
    try {
      const googleEventId = await scheduleMeetingOnGoogleCalendar(title, previewInstant.toISOString(), durationMinutes);
      if (isCancelledRef.current) return;
      onScheduled(buildMeeting(title, previewInstant, existingMeetingIds, googleEventId));
      posthog?.capture('meeting_scheduled', { duration_minutes: durationMinutes });
      setStatus('success');
    } catch (err) {
      if (isCancelledRef.current) return;
      console.error('overlap: failed to schedule the meeting', err);
      posthog?.captureException(err);
      setError(err instanceof Error ? err.message : 'Could not schedule the meeting.');
      setStatus('error');
    }
  };

  if (!isConfigured) {
    return (
      <div className={styles.form}>
        <div className={styles.heading}>Schedule meeting</div>
        <p className={styles.gatedNote}>
          Set <code>VITE_GOOGLE_CLIENT_ID</code> to enable scheduling meetings straight to Google Calendar.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={handleCancel}>
            Close
          </button>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className={styles.form}>
        <div className={styles.heading}>Schedule meeting</div>
        <p className={styles.successNote} role="status">
          ✓ added
        </p>
        <p className={styles.successDetail}>{formatScheduledSummary(previewInstant)}</p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.heading}>Schedule meeting</div>

      <fieldset
        className={styles.fieldset}
        disabled={!isEnabled}
        title={isEnabled ? undefined : SCRUB_GATE_TOOLTIP}
      >
        <div className={styles.field}>
          <input
            className={styles.textInput}
            type="text"
            placeholder="Meeting title…"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Meeting title"
            autoComplete="off"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.hoursLabel}>
            When
            <div className={styles.whenRow}>
              <input
                className={styles.textInput}
                type="date"
                value={toDateInputValue(previewInstant)}
                onChange={(event) => handleDateChange(event.target.value)}
                onClick={handleWhenClick}
              />
              <span className={styles.timeReadout}>{formatLocalTime(previewInstant)}</span>
            </div>
          </label>
        </div>

        <div className={styles.field}>
          {/* a plain div, not a <label> — it labels a button group, not one form control */}
          <div className={styles.hoursLabel}>
            Duration
            <div className={styles.durationRow} role="group" aria-label="Meeting duration">
              {DURATION_OPTIONS_MINUTES.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className={minutes === durationMinutes ? styles.durationButtonActive : styles.durationButton}
                  aria-pressed={minutes === durationMinutes}
                  onClick={() => setDurationMinutes(minutes)}
                >
                  {formatDurationLabel(minutes)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </fieldset>

      <p className={isEnabled ? styles.hint : styles.hintGate}>
        {isEnabled ? 'Drag the clock face (or use the arrow keys) to preview a different time.' : SCRUB_GATE_TOOLTIP}
      </p>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={handleCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className={styles.addButton}
          disabled={status === 'pending' || !isEnabled}
          title={isEnabled ? undefined : SCRUB_GATE_TOOLTIP}
        >
          {status === 'pending' ? 'Scheduling…' : 'Schedule'}
        </button>
      </div>

      {matchedMeeting && (
        <div className={styles.meetingBanner}>
          <div className={styles.meetingBannerHeading}>Already on the calendar</div>
          <div className={styles.meetingBannerTitle}>{matchedMeeting.title}</div>
          <div className={styles.meetingBannerTime}>
            {formatScheduledSummary(parseMeetingInstant(matchedMeeting.startISO) ?? previewInstant)}
          </div>
          {!matchedMeeting.googleEventId && (
            <p className={styles.meetingBannerNote}>Not linked to Google Calendar — deleting only removes it here.</p>
          )}
          {deleteError && (
            <div className={styles.error} role="alert">
              {deleteError}
            </div>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.deleteButton}
              onClick={handleDeleteMeeting}
              disabled={deleteStatus === 'pending'}
            >
              {deleteStatus === 'pending' ? 'Deleting…' : 'Delete meeting'}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
