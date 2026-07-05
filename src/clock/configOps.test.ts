import { describe, expect, it } from 'vitest';
import { addLocationOp, addMeetingOp, removeLocationOp, setHomeOp, updateLocationOp } from './configOps';
import type { ClockConfig, Location } from './types';

const HOME: Location = { id: 'tel-aviv', label: 'Tel Aviv', timezoneId: 'Asia/Jerusalem', color: '#38BDF8', workStart: 9, workEnd: 18 };
const SF: Location = { id: 'san-francisco', label: 'San Francisco', timezoneId: 'America/Los_Angeles', color: '#FB7185', workStart: 9, workEnd: 18 };
const NY: Location = { id: 'new-york', label: 'New York', timezoneId: 'America/New_York', color: '#FBBF4B', workStart: 9, workEnd: 18 };

const BASE_CONFIG: ClockConfig = { home: HOME, rings: [SF], meetings: [] };

describe('setHomeOp', () => {
  it('replaces the home location', () => {
    const next = setHomeOp(BASE_CONFIG, NY);
    expect(next.home).toEqual(NY);
    expect(next.rings).toBe(BASE_CONFIG.rings);
  });
});

describe('addLocationOp', () => {
  it('appends a new ring location', () => {
    const next = addLocationOp(BASE_CONFIG, NY);
    expect(next.rings).toEqual([SF, NY]);
    expect(BASE_CONFIG.rings).toEqual([SF]); // original untouched
  });
});

describe('removeLocationOp', () => {
  it('removes the matching ring location', () => {
    const next = removeLocationOp({ ...BASE_CONFIG, rings: [SF, NY] }, SF.id);
    expect(next.rings).toEqual([NY]);
  });

  it('is a no-op when the id does not match anything', () => {
    const next = removeLocationOp(BASE_CONFIG, 'not-a-real-id');
    expect(next.rings).toEqual(BASE_CONFIG.rings);
  });
});

describe('updateLocationOp', () => {
  it('patches only the matching location', () => {
    const next = updateLocationOp({ ...BASE_CONFIG, rings: [SF, NY] }, SF.id, { color: '#000000' });
    expect(next.rings[0]).toEqual({ ...SF, color: '#000000' });
    expect(next.rings[1]).toEqual(NY);
  });

  it('leaves rings unchanged when the id does not match anything', () => {
    const next = updateLocationOp(BASE_CONFIG, 'not-a-real-id', { color: '#000000' });
    expect(next.rings).toEqual(BASE_CONFIG.rings);
  });
});

describe('addMeetingOp', () => {
  it('appends a new meeting', () => {
    const meeting = { id: 'm1', startISO: '2026-01-01T10:00:00.000Z', title: 'Sync' };
    const next = addMeetingOp(BASE_CONFIG, meeting);
    expect(next.meetings).toEqual([meeting]);
    expect(BASE_CONFIG.meetings).toEqual([]); // original untouched
  });
});
