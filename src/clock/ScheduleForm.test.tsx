import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScheduleForm } from './ScheduleForm';
import * as googleCalendar from './googleCalendar';
import { formatScheduledSummary } from './meetingForm';

vi.mock('./googleCalendar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./googleCalendar')>();
  return {
    ...actual,
    isGoogleCalendarConfigured: vi.fn(),
    scheduleMeetingOnGoogleCalendar: vi.fn(),
    deleteMeetingFromGoogleCalendar: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const PREVIEW_INSTANT = new Date('2026-01-01T10:00:00.000Z');

function renderForm(overrides: Partial<Parameters<typeof ScheduleForm>[0]> = {}) {
  const onChangeInstant = vi.fn();
  const onScheduled = vi.fn();
  const onCancel = vi.fn();
  const onDeleteMeeting = vi.fn();
  render(
    <ScheduleForm
      previewInstant={PREVIEW_INSTANT}
      onChangeInstant={onChangeInstant}
      existingMeetingIds={[]}
      onScheduled={onScheduled}
      onCancel={onCancel}
      isEnabled
      onDeleteMeeting={onDeleteMeeting}
      {...overrides}
    />,
  );
  return { onChangeInstant, onScheduled, onCancel, onDeleteMeeting };
}

describe('ScheduleForm gated state', () => {
  it('shows a gated note and no form fields when Google Calendar is not configured', async () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(false);
    const user = userEvent.setup();
    const { onCancel } = renderForm();

    expect(screen.getByText(/VITE_GOOGLE_CLIENT_ID/)).toBeTruthy();
    expect(screen.queryByLabelText('Meeting title')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('ScheduleForm submission', () => {
  it('shows a validation error and does not schedule when the title is empty', async () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Schedule' }));

    expect(screen.getByRole('alert').textContent).toMatch(/title is required/i);
    expect(googleCalendar.scheduleMeetingOnGoogleCalendar).not.toHaveBeenCalled();
  });

  it('schedules the meeting, reports success, and hands the built meeting to onScheduled', async () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mockResolvedValue('evt-123');
    const user = userEvent.setup();
    const { onScheduled } = renderForm();

    await user.type(screen.getByLabelText('Meeting title'), 'Sync');
    await user.click(screen.getByRole('button', { name: 'Schedule' }));

    await waitFor(() => expect(onScheduled).toHaveBeenCalledTimes(1));
    expect(googleCalendar.scheduleMeetingOnGoogleCalendar).toHaveBeenCalledWith(
      'Sync',
      PREVIEW_INSTANT.toISOString(),
      googleCalendar.DEFAULT_MEETING_DURATION_MINUTES,
    );
    expect(onScheduled.mock.calls[0][0]).toMatchObject({
      title: 'Sync',
      startISO: PREVIEW_INSTANT.toISOString(),
      googleEventId: 'evt-123',
    });
    expect(screen.getByRole('status').textContent).toMatch(/added/i);
    // the date/time actually scheduled, not just a bare confirmation
    expect(screen.getByText(formatScheduledSummary(PREVIEW_INSTANT))).toBeTruthy();
  });

  it('shows an inline, retryable error when scheduling fails', async () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    const { onScheduled } = renderForm();

    await user.type(screen.getByLabelText('Meeting title'), 'Sync');
    await user.click(screen.getByRole('button', { name: 'Schedule' }));

    expect((await screen.findByRole('alert')).textContent).toBe('boom');
    expect(onScheduled).not.toHaveBeenCalled();
    // still on the form, so the user can retry without re-entering the title
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeTruthy();
  });

  it('lets the user pick a different duration before submitting', async () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mockResolvedValue('evt-123');
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Meeting title'), 'Sync');
    await user.click(screen.getByRole('button', { name: '1h' }));
    await user.click(screen.getByRole('button', { name: 'Schedule' }));

    await waitFor(() =>
      expect(googleCalendar.scheduleMeetingOnGoogleCalendar).toHaveBeenCalledWith('Sync', PREVIEW_INSTANT.toISOString(), 60),
    );
  });

  it('does not call onScheduled or show success if Cancel is clicked while the request is still pending', async () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    let resolveSchedule: (eventId: string) => void = () => {};
    const pending = new Promise<string>((resolve) => {
      resolveSchedule = resolve;
    });
    vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mockReturnValue(pending);
    const user = userEvent.setup();
    const { onScheduled, onCancel } = renderForm();

    await user.type(screen.getByLabelText('Meeting title'), 'Sync');
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(screen.getByRole('button', { name: 'Scheduling…' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    resolveSchedule('evt-123');
    // give the resolved promise's continuation inside handleSubmit a chance to run
    await pending;
    await Promise.resolve();

    expect(onScheduled).not.toHaveBeenCalled();
  });
});

describe('ScheduleForm scrub gate', () => {
  it('disables the fieldset and shows the scrub-gate tooltip when not enabled', () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    renderForm({ isEnabled: false });

    const titleInput = screen.getByLabelText('Meeting title') as HTMLInputElement;
    expect(titleInput.closest('fieldset')?.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Schedule' }).getAttribute('title')).toBe('Scrub the rings to pick a time');
  });
});

describe('ScheduleForm matched-meeting banner', () => {
  const MATCHED_MEETING = { id: 'm1', title: 'Design review', startISO: PREVIEW_INSTANT.toISOString(), googleEventId: 'evt-1' };

  it('shows no banner when there is no matched meeting', () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    renderForm({ matchedMeeting: undefined });

    expect(screen.queryByText('Already on the calendar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete meeting' })).toBeNull();
  });

  it('shows the matched meeting\'s title, time, and a delete action', () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    renderForm({ matchedMeeting: MATCHED_MEETING });

    expect(screen.getByText('Design review')).toBeTruthy();
    expect(screen.getByText(formatScheduledSummary(PREVIEW_INSTANT))).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete meeting' })).toBeTruthy();
    expect(screen.queryByText(/Not linked to Google Calendar/)).toBeNull();
  });

  it('notes when a matched meeting has no googleEventId (pre-migration or a foreign share link)', () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    renderForm({ matchedMeeting: { id: 'm1', title: 'Old sync', startISO: PREVIEW_INSTANT.toISOString() } });

    expect(screen.getByText(/Not linked to Google Calendar/)).toBeTruthy();
  });

  it('deletes via Google Calendar (re-signing in) then removes it locally when the meeting has a googleEventId', async () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    vi.mocked(googleCalendar.deleteMeetingFromGoogleCalendar).mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { onDeleteMeeting } = renderForm({ matchedMeeting: MATCHED_MEETING });

    await user.click(screen.getByRole('button', { name: 'Delete meeting' }));

    await waitFor(() => expect(onDeleteMeeting).toHaveBeenCalledWith('m1'));
    expect(googleCalendar.deleteMeetingFromGoogleCalendar).toHaveBeenCalledWith('evt-1');
  });

  it('skips the Google Calendar call and removes the meeting locally when it has no googleEventId', async () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    vi.mocked(googleCalendar.deleteMeetingFromGoogleCalendar).mockClear();
    const user = userEvent.setup();
    const { onDeleteMeeting } = renderForm({
      matchedMeeting: { id: 'm1', title: 'Old sync', startISO: PREVIEW_INSTANT.toISOString() },
    });

    await user.click(screen.getByRole('button', { name: 'Delete meeting' }));

    await waitFor(() => expect(onDeleteMeeting).toHaveBeenCalledWith('m1'));
    expect(googleCalendar.deleteMeetingFromGoogleCalendar).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not remove the meeting when the Google Calendar delete fails', async () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    vi.mocked(googleCalendar.deleteMeetingFromGoogleCalendar).mockRejectedValue(new Error('sign-in cancelled'));
    const user = userEvent.setup();
    const { onDeleteMeeting } = renderForm({ matchedMeeting: MATCHED_MEETING });

    await user.click(screen.getByRole('button', { name: 'Delete meeting' }));

    expect((await screen.findByRole('alert')).textContent).toBe('sign-in cancelled');
    expect(onDeleteMeeting).not.toHaveBeenCalled();
    // still there, so the user can retry
    expect(screen.getByRole('button', { name: 'Delete meeting' })).toBeTruthy();
  });

  it('disables the delete button while the delete is pending', async () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    let resolveDelete: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      resolveDelete = resolve;
    });
    vi.mocked(googleCalendar.deleteMeetingFromGoogleCalendar).mockReturnValue(pending);
    const user = userEvent.setup();
    renderForm({ matchedMeeting: MATCHED_MEETING });

    await user.click(screen.getByRole('button', { name: 'Delete meeting' }));
    expect(screen.getByRole('button', { name: 'Deleting…' }).hasAttribute('disabled')).toBe(true);

    resolveDelete();
    await pending;
  });
});

describe('ScheduleForm date + cancel', () => {
  it('calls onChangeInstant with the new day, keeping the previewed time-of-day', () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    const { onChangeInstant } = renderForm();

    const dateInput = screen.getByDisplayValue('2026-01-01') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-02-15' } });

    expect(onChangeInstant).toHaveBeenCalledTimes(1);
    const changedTo: Date = onChangeInstant.mock.calls[0][0];
    expect(changedTo.getFullYear()).toBe(2026);
    expect(changedTo.getMonth()).toBe(1);
    expect(changedTo.getDate()).toBe(15);
  });

  it('logs and does not call onChangeInstant for an unparseable date value', () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { onChangeInstant } = renderForm();

    const dateInput = screen.getByDisplayValue('2026-01-01') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: 'not-a-date' } });

    expect(onChangeInstant).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    const user = userEvent.setup();
    const { onCancel } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
