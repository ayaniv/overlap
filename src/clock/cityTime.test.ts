import { describe, expect, it } from 'vitest';
import { getCityDateKey, getCityDateLabel, getCityTime, isWithinWorkingHours } from './cityTime';

describe('getCityTime', () => {
  it('reads the correct local hour for a given IANA timezone', () => {
    // 12:00 UTC is 13:00 in Europe/London during BST (July)
    const time = getCityTime(new Date('2026-07-02T12:00:00.000Z'), 'Europe/London');
    expect(time.label).toBe('13:00');
    expect(time.frac).toBeCloseTo(13);
  });

  it('handles the New York offset', () => {
    const time = getCityTime(new Date('2026-07-02T12:00:00.000Z'), 'America/New_York');
    expect(time.label).toBe('08:00');
  });
});

describe('getCityDateLabel', () => {
  it('formats as "WEEKDAY DD MON" uppercased', () => {
    const label = getCityDateLabel(new Date('2026-07-02T12:00:00.000Z'), 'Asia/Jerusalem');
    expect(label).toBe('THU 02 JUL');
  });
});

describe('getCityDateKey', () => {
  it('formats as YYYY-MM-DD in the given timezone', () => {
    expect(getCityDateKey(new Date('2026-07-02T12:00:00.000Z'), 'Asia/Jerusalem')).toBe('2026-07-02');
  });

  it('crosses a day boundary that UTC alone would not', () => {
    // 23:30 UTC on Jul 1 is already Jul 2 in Asia/Jerusalem (UTC+3 in July)
    expect(getCityDateKey(new Date('2026-07-01T23:30:00.000Z'), 'Asia/Jerusalem')).toBe('2026-07-02');
    expect(getCityDateKey(new Date('2026-07-01T23:30:00.000Z'), 'UTC')).toBe('2026-07-01');
  });
});

describe('isWithinWorkingHours', () => {
  it('is inclusive of the start hour and exclusive of the end hour', () => {
    expect(isWithinWorkingHours(9, 9, 18)).toBe(true);
    expect(isWithinWorkingHours(17.99, 9, 18)).toBe(true);
    expect(isWithinWorkingHours(18, 9, 18)).toBe(false);
    expect(isWithinWorkingHours(8.99, 9, 18)).toBe(false);
  });
});
