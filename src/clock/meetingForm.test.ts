import { describe, expect, it } from 'vitest';
import { buildMeeting, fromDatetimeLocalValue, toDatetimeLocalValue, validateMeetingTitle } from './meetingForm';

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

describe('toDatetimeLocalValue / fromDatetimeLocalValue', () => {
  it('round-trips a date through the datetime-local format', () => {
    const date = new Date(2026, 0, 15, 9, 30);
    const value = toDatetimeLocalValue(date);
    expect(value).toBe('2026-01-15T09:30');
    expect(fromDatetimeLocalValue(value)).toEqual(date);
  });

  it('pads single-digit month/day/hour/minute', () => {
    const date = new Date(2026, 2, 5, 4, 7);
    expect(toDatetimeLocalValue(date)).toBe('2026-03-05T04:07');
  });

  it('returns null for an empty value', () => {
    expect(fromDatetimeLocalValue('')).toBeNull();
  });

  it('returns null for an unparseable value', () => {
    expect(fromDatetimeLocalValue('not-a-date')).toBeNull();
  });
});
