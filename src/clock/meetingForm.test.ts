import { describe, expect, it } from 'vitest';
import { buildMeeting, formatDurationLabel, formatLocalTime, toDateInputValue, validateMeetingTitle, withDatePart } from './meetingForm';

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
