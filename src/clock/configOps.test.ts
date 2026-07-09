import { afterEach, describe, expect, it, vi } from 'vitest';
import { addLocationOp, addMeetingOp, removeLocationOp, removeMeetingOp, reorderLocationsOp, setHomeOp, updateLocationOp } from './configOps';
import type { ClockConfig, Location } from './types';

const HOME: Location = { id: 'tel-aviv', label: 'Tel Aviv', timezoneId: 'Asia/Jerusalem', color: '#38BDF8', workStart: 9, workEnd: 18 };
const SF: Location = { id: 'san-francisco', label: 'San Francisco', timezoneId: 'America/Los_Angeles', color: '#FB7185', workStart: 9, workEnd: 18 };
const NY: Location = { id: 'new-york', label: 'New York', timezoneId: 'America/New_York', color: '#FBBF4B', workStart: 9, workEnd: 18 };
const LONDON: Location = { id: 'london', label: 'London', timezoneId: 'Europe/London', color: '#34D399', workStart: 9, workEnd: 18 };

const BASE_CONFIG: ClockConfig = { home: HOME, rings: [SF], meetings: [] };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('setHomeOp', () => {
  it('swaps home and rings: the chosen ring becomes home, and the outgoing home slides into that ring\'s old slot', () => {
    const config: ClockConfig = { ...BASE_CONFIG, rings: [SF, NY] };
    const next = setHomeOp(config, NY);
    expect(next.home).toEqual(NY);
    expect(next.rings).toEqual([SF, HOME]);
  });

  // regression: ManageLocationsList passes its own display copy of a location
  // (spread with an extra `isHome` flag for rendering, not part of `Location`)
  // — only the id should be trusted for the lookup, so that flag (or any other
  // stray property) never leaks into the persisted config
  it('uses the canonical ring object as the new home, ignoring extra properties on the passed-in value', () => {
    const config: ClockConfig = { ...BASE_CONFIG, rings: [SF, NY] };
    const next = setHomeOp(config, { ...NY, isHome: false } as Location);
    expect(next.home).toEqual(NY);
    expect(next.home).not.toHaveProperty('isHome');
  });

  it('is a no-op when asked to set home to the already-current home', () => {
    const next = setHomeOp(BASE_CONFIG, HOME);
    expect(next).toBe(BASE_CONFIG);
  });

  it('logs an error and is a no-op when given a location that is not an existing ring', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const next = setHomeOp(BASE_CONFIG, NY); // NY isn't in BASE_CONFIG.rings ([SF])
    expect(next).toBe(BASE_CONFIG);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('reorderLocationsOp', () => {
  const config: ClockConfig = { ...BASE_CONFIG, rings: [LONDON, SF, NY] };

  it('reorders rings only when the first id (home) is unchanged', () => {
    const next = reorderLocationsOp(config, [HOME.id, NY.id, SF.id, LONDON.id]);
    expect(next.home).toEqual(HOME);
    expect(next.rings).toEqual([LONDON, SF, NY]);
  });

  it('promotes the dragged-in location to home and slides the outgoing home into rings', () => {
    // NY moves into the first (home) slot; the rest keep their relative inside->outside order
    const next = reorderLocationsOp(config, [NY.id, SF.id, HOME.id, LONDON.id]);
    expect(next.home).toEqual(NY);
    expect(next.rings).toEqual([LONDON, HOME, SF]);
  });

  it('logs an error and is a no-op when the id list is the wrong length', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const next = reorderLocationsOp(config, [HOME.id, SF.id]);
    expect(next).toBe(config);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('logs an error and is a no-op when the id list has a duplicate', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const next = reorderLocationsOp(config, [HOME.id, SF.id, SF.id, LONDON.id]);
    expect(next).toBe(config);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('logs an error and is a no-op when the id list contains an unknown id', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const next = reorderLocationsOp(config, [HOME.id, SF.id, NY.id, 'not-a-real-id']);
    expect(next).toBe(config);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('addLocationOp', () => {
  it('adds the new ring location first, so it lands on the outermost ring', () => {
    const next = addLocationOp(BASE_CONFIG, NY);
    expect(next.rings).toEqual([NY, SF]);
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

  // regression: home lives in its own `config.home` field, not `rings` — this
  // used to only ever map over `rings`, so editing color/hours for whichever
  // location currently is home silently did nothing at all
  it('patches home when id matches the current home, not a ring', () => {
    const next = updateLocationOp(BASE_CONFIG, HOME.id, { color: '#000000' });
    expect(next.home).toEqual({ ...HOME, color: '#000000' });
    expect(next.rings).toEqual(BASE_CONFIG.rings);
  });

  it('leaves home unchanged when the id does not match anything', () => {
    const next = updateLocationOp(BASE_CONFIG, 'not-a-real-id', { color: '#000000' });
    expect(next.home).toEqual(BASE_CONFIG.home);
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

describe('removeMeetingOp', () => {
  const meeting1 = { id: 'm1', startISO: '2026-01-01T10:00:00.000Z', title: 'Sync' };
  const meeting2 = { id: 'm2', startISO: '2026-01-02T10:00:00.000Z', title: 'Standup' };
  const configWithMeetings: ClockConfig = { ...BASE_CONFIG, meetings: [meeting1, meeting2] };

  it('removes the matching meeting', () => {
    const next = removeMeetingOp(configWithMeetings, meeting1.id);
    expect(next.meetings).toEqual([meeting2]);
  });

  it('is a no-op when the id does not match anything', () => {
    const next = removeMeetingOp(configWithMeetings, 'not-a-real-id');
    expect(next.meetings).toEqual(configWithMeetings.meetings);
  });
});
