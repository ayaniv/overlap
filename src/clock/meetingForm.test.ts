import { describe, expect, it } from 'vitest';
import {
  buildMeeting,
  buildOverlapMeetingTitle,
  findMeetingAtInstant,
  formatDurationLabel,
  formatLocalTime,
  formatScheduledSummary,
  toDateInputValue,
  validateMeetingTitle,
  withDatePart,
} from './meetingForm';
import type { Location } from './types';

describe('validateMeetingTitle', () => {
  it('requires a non-blank title', () => {
    expect(validateMeetingTitle('')).toBe('Title is required.');
    expect(validateMeetingTitle('   ')).toBe('Title is required.');
  });

  it('accepts a non-blank title', () => {
    expect(validateMeetingTitle('Design review')).toBeNull();
  });
});

describe('buildMeeting', () => {
  const instant = new Date('2026-01-01T10:00:00.000Z');

  it('builds a meeting with a trimmed title and the instant as ISO', () => {
    const meeting = buildMeeting('  Design review  ', instant, []);
    expect(meeting).toEqual({ id: 'meeting-1', startISO: '2026-01-01T10:00:00.000Z', title: 'Design review' });
  });

  it('disambiguates the id against existing meeting ids', () => {
    const meeting = buildMeeting('Sync', instant, ['meeting-1', 'meeting-2']);
    expect(meeting.id).toBe('meeting-3');
  });

  it('stores the Google Calendar event id when given one', () => {
    const meeting = buildMeeting('Sync', instant, [], 'evt-abc');
    expect(meeting.googleEventId).toBe('evt-abc');
  });

  it('omits googleEventId when none is given', () => {
    const meeting = buildMeeting('Sync', instant, []);
    expect(meeting.googleEventId).toBeUndefined();
  });
});

describe('buildOverlapMeetingTitle', () => {
  const HOME: Location = { id: 'tel-aviv', label: 'Tel Aviv', timezoneId: 'Asia/Jerusalem', color: '#38BDF8', workStart: 9, workEnd: 18 };
  const LONDON: Location = { id: 'london', label: 'London', timezoneId: 'Europe/London', color: '#FBBF4B', workStart: 9, workEnd: 18 };
  const SF: Location = { id: 'san-francisco', label: 'San Francisco', timezoneId: 'America/Los_Angeles', color: '#FB7185', workStart: 9, workEnd: 18 };

  it('lists home first, then every ring whose working hours cover the previewed instant', () => {
    // Tel Aviv 14:00 (in), London 12:00 (in), SF 04:00 (out)
    const instant = new Date('2026-01-01T12:00:00.000Z');
    expect(buildOverlapMeetingTitle(instant, HOME, [LONDON, SF])).toBe('Overlap-Clock Meeting: Tel Aviv <> London');
  });

  it('excludes home from the list when home itself is out of hours', () => {
    // Tel Aviv 22:00 (out), London 20:00 (out), SF 12:00 (in)
    const instant = new Date('2026-01-01T20:00:00.000Z');
    expect(buildOverlapMeetingTitle(instant, HOME, [LONDON, SF])).toBe('Overlap-Clock Meeting: San Francisco');
  });

  it('falls back to just home when nobody, including home, is in working hours', () => {
    // Tel Aviv ~00:00 (out), London 22:00 (out)
    const instant = new Date('2026-01-01T22:00:00.000Z');
    expect(buildOverlapMeetingTitle(instant, HOME, [LONDON])).toBe('Overlap-Clock Meeting: Tel Aviv');
  });

  it('lists just home when there are no rings and home is in hours', () => {
    const instant = new Date('2026-01-01T12:00:00.000Z');
    expect(buildOverlapMeetingTitle(instant, HOME, [])).toBe('Overlap-Clock Meeting: Tel Aviv');
  });
});

describe('findMeetingAtInstant', () => {
  const meeting1 = { id: 'm1', startISO: '2026-01-01T10:00:00.000Z', title: 'Sync' };
  const meeting2 = { id: 'm2', startISO: '2026-01-01T14:00:00.000Z', title: 'Standup' };
  const meetings = [meeting1, meeting2];
  const toleranceMs = 5 * 60_000;

  it('matches a meeting whose instant is exactly the given instant', () => {
    expect(findMeetingAtInstant(meetings, new Date(meeting1.startISO), toleranceMs)).toEqual(meeting1);
  });

  it('matches a meeting within the tolerance window', () => {
    const instant = new Date(new Date(meeting1.startISO).getTime() + 2 * 60_000);
    expect(findMeetingAtInstant(meetings, instant, toleranceMs)).toEqual(meeting1);
  });

  it('does not match a meeting outside the tolerance window', () => {
    const instant = new Date(new Date(meeting1.startISO).getTime() + 10 * 60_000);
    expect(findMeetingAtInstant(meetings, instant, toleranceMs)).toBeUndefined();
  });

  it('returns undefined when there is no meeting nearby', () => {
    expect(findMeetingAtInstant(meetings, new Date('2026-06-01T00:00:00.000Z'), toleranceMs)).toBeUndefined();
  });

  it('returns undefined for an empty meetings list', () => {
    expect(findMeetingAtInstant([], new Date(), toleranceMs)).toBeUndefined();
  });

  it('skips a meeting with an unparseable startISO and logs nothing (parseMeetingInstant already handles that)', () => {
    const invalid = { id: 'bad', startISO: 'not-a-date', title: 'Broken' };
    expect(findMeetingAtInstant([invalid], new Date(), toleranceMs)).toBeUndefined();
  });

  it('picks the closest match when two meetings are both within tolerance', () => {
    const close = { id: 'close', startISO: '2026-01-01T10:01:00.000Z', title: 'Close' };
    const closer = { id: 'closer', startISO: '2026-01-01T10:00:30.000Z', title: 'Closer' };
    const instant = new Date('2026-01-01T10:00:00.000Z');
    expect(findMeetingAtInstant([close, closer], instant, toleranceMs)).toEqual(closer);
  });
});

describe('toDateInputValue', () => {
  it('formats a date as YYYY-MM-DD in local time', () => {
    expect(toDateInputValue(new Date(2026, 0, 15, 9, 30))).toBe('2026-01-15');
  });

  it('pads single-digit month/day', () => {
    expect(toDateInputValue(new Date(2026, 2, 5, 4, 7))).toBe('2026-03-05');
  });
});

describe('withDatePart', () => {
  const timeSource = new Date(2026, 0, 15, 9, 30, 0);

  it('replaces the date while preserving the time-of-day', () => {
    const combined = withDatePart('2026-03-20', timeSource);
    expect(combined).toEqual(new Date(2026, 2, 20, 9, 30, 0));
  });

  it('returns null for an empty value', () => {
    expect(withDatePart('', timeSource)).toBeNull();
  });

  it('returns null for an unparseable value', () => {
    expect(withDatePart('not-a-date', timeSource)).toBeNull();
  });
});

describe('formatLocalTime', () => {
  it('formats HH:MM in local time', () => {
    expect(formatLocalTime(new Date(2026, 0, 15, 9, 30))).toBe('09:30');
  });

  it('pads single-digit hour/minute', () => {
    expect(formatLocalTime(new Date(2026, 0, 15, 4, 7))).toBe('04:07');
  });
});

describe('formatDurationLabel', () => {
  it('reads sub-hour amounts as minutes', () => {
    expect(formatDurationLabel(15)).toBe('15m');
    expect(formatDurationLabel(30)).toBe('30m');
    expect(formatDurationLabel(45)).toBe('45m');
  });

  it('reads whole hours as "Nh"', () => {
    expect(formatDurationLabel(60)).toBe('1h');
    expect(formatDurationLabel(120)).toBe('2h');
  });
});

describe('formatScheduledSummary', () => {
  it('formats as "Weekday, Mon D · HH:MM" in local time', () => {
    expect(formatScheduledSummary(new Date(2026, 0, 15, 9, 30))).toBe('Thu, Jan 15 · 09:30');
  });

  it('pads single-digit hour/minute in the time portion', () => {
    expect(formatScheduledSummary(new Date(2026, 2, 5, 4, 7))).toBe('Thu, Mar 5 · 04:07');
  });
});
