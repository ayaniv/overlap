import { describe, expect, it } from 'vitest';
import { isValidClockConfig } from './configValidation';
import type { ClockConfig } from './types';

const VALID_CONFIG: ClockConfig = {
  home: { id: 'tel-aviv', label: 'Tel Aviv', timezoneId: 'Asia/Jerusalem', color: '#38BDF8', workStart: 9, workEnd: 18 },
  rings: [{ id: 'san-francisco', label: 'San Francisco', timezoneId: 'America/Los_Angeles', color: '#FB7185', workStart: 9, workEnd: 18 }],
  meetings: [{ id: 'm1', startISO: '2026-01-01T10:00:00.000Z', title: 'Sync' }],
};

describe('isValidClockConfig', () => {
  it('accepts a well-formed config', () => {
    expect(isValidClockConfig(VALID_CONFIG)).toBe(true);
  });

  it('accepts empty rings/meetings arrays', () => {
    expect(isValidClockConfig({ ...VALID_CONFIG, rings: [], meetings: [] })).toBe(true);
  });

  it('rejects null and non-objects', () => {
    expect(isValidClockConfig(null)).toBe(false);
    expect(isValidClockConfig(undefined)).toBe(false);
    expect(isValidClockConfig('a string')).toBe(false);
    expect(isValidClockConfig(42)).toBe(false);
  });

  it('rejects a config missing required top-level fields', () => {
    expect(isValidClockConfig({})).toBe(false);
    expect(isValidClockConfig({ home: VALID_CONFIG.home })).toBe(false);
  });

  it('rejects a home location missing required fields', () => {
    const incompleteHome = { id: 'tel-aviv', label: 'Tel Aviv', timezoneId: 'Asia/Jerusalem', color: '#38BDF8' };
    expect(isValidClockConfig({ ...VALID_CONFIG, home: incompleteHome })).toBe(false);
  });

  it('rejects when rings is not an array', () => {
    expect(isValidClockConfig({ ...VALID_CONFIG, rings: 'not-an-array' })).toBe(false);
  });

  it('rejects when a ring entry has the wrong shape', () => {
    expect(isValidClockConfig({ ...VALID_CONFIG, rings: [{ id: 'incomplete' }] })).toBe(false);
  });

  it('rejects when a meeting entry has the wrong shape', () => {
    expect(isValidClockConfig({ ...VALID_CONFIG, meetings: [{ id: 'm1' }] })).toBe(false);
  });
});
