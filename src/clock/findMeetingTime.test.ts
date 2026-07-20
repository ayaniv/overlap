// src/clock/findMeetingTime.test.ts
import { describe, expect, it } from 'vitest';
import { nextWorkingWindow, widenWindow } from './findMeetingTime';
import type { Location } from './types';

const NOW = new Date('2026-01-01T15:00:00.000Z');

function makeLocation(overrides: Partial<Location>): Location {
  return { id: 'city', label: 'City', timezoneId: 'UTC', color: '#38BDF8', workStart: 9, workEnd: 17, ...overrides };
}

describe('nextWorkingWindow', () => {
  it('starts at offset 0 when already inside working hours, ending when hours end today', () => {
    // Etc/GMT+3 = UTC-3, so 15:00Z reads as local 12:00 -> inside [9, 17)
    const location = makeLocation({ timezoneId: 'Etc/GMT+3', workStart: 9, workEnd: 17 });
    expect(nextWorkingWindow(NOW, location)).toEqual({ id: 'city', startOffsetHours: 0, endOffsetHours: 5 });
  });

  it('starts in the future when currently outside working hours', () => {
    // Etc/GMT+7 = UTC-7, so 15:00Z reads as local 08:00 -> outside [9, 17)
    const location = makeLocation({ id: 'sf', timezoneId: 'Etc/GMT+7', workStart: 9, workEnd: 17 });
    expect(nextWorkingWindow(NOW, location)).toEqual({ id: 'sf', startOffsetHours: 1, endOffsetHours: 9 });
  });

  it('wraps forward across midnight when the start hour is earlier than the current hour', () => {
    // Etc/GMT-8 = UTC+8, so 15:00Z reads as local 23:00 -> next 9am start is 10h away
    const location = makeLocation({ id: 'tokyo', timezoneId: 'Etc/GMT-8', workStart: 9, workEnd: 18 });
    expect(nextWorkingWindow(NOW, location)).toEqual({ id: 'tokyo', startOffsetHours: 10, endOffsetHours: 19 });
  });
});

describe('widenWindow', () => {
  it('expands both ends by the given hours', () => {
    expect(widenWindow({ id: 'x', startOffsetHours: 5, endOffsetHours: 10 }, 1)).toEqual({
      id: 'x',
      startOffsetHours: 4,
      endOffsetHours: 11,
    });
  });

  it('clamps the start at 0 instead of going negative', () => {
    expect(widenWindow({ id: 'x', startOffsetHours: 0.5, endOffsetHours: 10 }, 1)).toEqual({
      id: 'x',
      startOffsetHours: 0,
      endOffsetHours: 11,
    });
  });
});

import { sweepMaxOverlap } from './findMeetingTime';

describe('sweepMaxOverlap', () => {
  it('finds the earliest point where the most windows overlap', () => {
    const result = sweepMaxOverlap([
      { id: 'a', startOffsetHours: 0, endOffsetHours: 5 },
      { id: 'b', startOffsetHours: 3, endOffsetHours: 8 },
      { id: 'c', startOffsetHours: 20, endOffsetHours: 25 },
    ]);
    expect(result).toEqual({ startOffsetHours: 3, endOffsetHours: 5, count: 2 });
  });

  it('returns count 1 at the earliest window when nothing overlaps', () => {
    const result = sweepMaxOverlap([
      { id: 'a', startOffsetHours: 1, endOffsetHours: 9 },
      { id: 'b', startOffsetHours: 10, endOffsetHours: 19 },
    ]);
    expect(result).toEqual({ startOffsetHours: 1, endOffsetHours: 9, count: 1 });
  });

  it('treats a window ending exactly when another starts as non-overlapping', () => {
    const result = sweepMaxOverlap([
      { id: 'a', startOffsetHours: 0, endOffsetHours: 5 },
      { id: 'b', startOffsetHours: 5, endOffsetHours: 10 },
    ]);
    expect(result.count).toBe(1);
  });

  it('returns count 0 for an empty list of windows', () => {
    expect(sweepMaxOverlap([])).toEqual({ startOffsetHours: 0, endOffsetHours: 0, count: 0 });
  });
});
