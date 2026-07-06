import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { isGoogleCalendarConfigured, scheduleMeetingOnGoogleCalendar } from './googleCalendar';
import { buildMeeting, fromDatetimeLocalValue, toDatetimeLocalValue, validateMeetingTitle } from './meetingForm';
import type { Meeting } from './types';
import styles from './ScheduleForm.module.css';

const AUTO_RETURN_DELAY_MS = 3000;

export type ScheduleFormProps = {
  previewInstant: Date;
  onChangeInstant: (instant: Date) => void;
  existingMeetingIds: string[];
  onScheduled: (meeting: Meeting) => void;
  onCancel: () => void;
};

type Status = 'idle' | 'pending' | 'success' | 'error';

// renders inside the schedule-mode panel anchored next to the Schedule button: a title +
// datetime-local input (kept in sync with the ring-drag preview via onChangeInstant), and
// a Google Calendar submit that's gated behind VITE_GOOGLE_CLIENT_ID being configured.
export function ScheduleForm({ previewInstant, onChangeInstant, existingMeetingIds, onScheduled, onCancel }: ScheduleFormProps) {
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const isConfigured = isGoogleCalendarConfigured();

  useEffect(() => {
    if (status !== 'success') return;
    const timer = setTimeout(onCancel, AUTO_RETURN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, onCancel]);

  const handleInstantChange = (value: string) => {
    const instant = fromDatetimeLocalValue(value);
    if (!instant) {
      console.error('overlap: could not parse the datetime-local input value', value);
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
      await scheduleMeetingOnGoogleCalendar(title, previewInstant.toISOString());
      onScheduled(buildMeeting(title, previewInstant, existingMeetingIds));
      setStatus('success');
    } catch (err) {
      console.error('overlap: failed to schedule the meeting', err);
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
          <button type="button" className={styles.cancelButton} onClick={onCancel}>
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
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.heading}>Schedule meeting</div>

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
          <input
            className={styles.textInput}
            type="datetime-local"
            value={toDatetimeLocalValue(previewInstant)}
            onChange={(event) => handleInstantChange(event.target.value)}
          />
        </label>
      </div>

      <p className={styles.hint}>Drag the clock face (or use the arrow keys) to preview a different time.</p>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={styles.addButton} disabled={status === 'pending'}>
          {status === 'pending' ? 'Scheduling…' : 'Schedule'}
        </button>
      </div>
    </form>
  );
}
