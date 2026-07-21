// src/clock/findMeetingTime.test.ts
import { describe, expect, it } from 'vitest';
import { getNextWorkingWindow, widenWindow, sweepMaxOverlap, findBestMeetingOffset } from './findMeetingTime';
import type { Location } from './types';

const NOW = new Date('2026-01-01T15:00:00.000Z');

function makeLocation(overrides: Partial<Location>): Location {
  return { id: 'city', label: 'City', timezoneId: 'UTC', color: '#38BDF8', workStart: 9, workEnd: 17, ...overrides };
}

describe('getNextWorkingWindow', () => {
  it('starts at offset 0 when already inside working hours, ending when hours end today', () => {
    // Etc/GMT+3 = UTC-3, so 15:00Z reads as local 12:00 -> inside [9, 17)
    const location = makeLocation({ timezoneId: 'Etc/GMT+3', workStart: 9, workEnd: 17 });
    expect(getNextWorkingWindow(NOW, location)).toEqual({ id: 'city', startOffsetHours: 0, endOffsetHours: 5 });
  });

  it('starts in the future when currently outside working hours', () => {
    // Etc/GMT+7 = UTC-7, so 15:00Z reads as local 08:00 -> outside [9, 17)
    const location = makeLocation({ id: 'sf', timezoneId: 'Etc/GMT+7', workStart: 9, workEnd: 17 });
    expect(getNextWorkingWindow(NOW, location)).toEqual({ id: 'sf', startOffsetHours: 1, endOffsetHours: 9 });
  });

  it('wraps forward across midnight when the start hour is earlier than the current hour', () => {
    // Etc/GMT-8 = UTC+8, so 15:00Z reads as local 23:00 -> next 9am start is 10h away
    const location = makeLocation({ id: 'tokyo', timezoneId: 'Etc/GMT-8', workStart: 9, workEnd: 18 });
    expect(getNextWorkingWindow(NOW, location)).toEqual({ id: 'tokyo', startOffsetHours: 10, endOffsetHours: 19 });
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

const HOME: Location = { id: 'home', label: 'Home', timezoneId: 'Etc/GMT+7', color: '#38BDF8', workStart: 9, workEnd: 17 }; // UTC-7 -> local 08:00
const RING: Location = { id: 'ring', label: 'Ring', timezoneId: 'Etc/GMT-8', color: '#FB7185', workStart: 9, workEnd: 18 }; // UTC+8 -> local 23:00

describe('findBestMeetingOffset', () => {
  // also covers the "single remaining ring" case: home + one ring is the
  // full city list here, and the algorithm needs no special-casing for it —
  // the stretch fallback is exactly what makes a fit possible at all
  it('falls back to a stretched fit when no perfect overlap exists between home and a ring', () => {
    const result = findBestMeetingOffset(NOW, HOME, [RING]);

    expect(result.offsetMs).toBe(9 * 60 * 60_000);
    expect(result.perfectCount).toBe(0);
    expect(result.fitCount).toBe(2);
    expect(result.totalCount).toBe(2);
    expect(result.cityResults).toEqual([
      { id: 'home', status: 'stretched' },
      { id: 'ring', status: 'stretched' },
    ]);
  });

  it('returns offset 0 when every city is already in its working hours', () => {
    // Etc/GMT+5 = UTC-5 -> local 10:00 (inside 9-17); Etc/GMT+4 = UTC-4 -> local 11:00 (inside 9-18)
    const homeInHours: Location = { id: 'home', label: 'Home', timezoneId: 'Etc/GMT+5', color: '#38BDF8', workStart: 9, workEnd: 17 };
    const ringInHours: Location = { id: 'ring', label: 'Ring', timezoneId: 'Etc/GMT+4', color: '#FB7185', workStart: 9, workEnd: 18 };

    const result = findBestMeetingOffset(NOW, homeInHours, [ringInHours]);

    expect(result.offsetMs).toBe(0);
    expect(result.perfectCount).toBe(2);
    expect(result.fitCount).toBe(2);
    expect(result.cityResults).toEqual([
      { id: 'home', status: 'in-hours' },
      { id: 'ring', status: 'in-hours' },
    ]);
  });

  it('snaps the landing time forward to the next quarter-hour boundary', () => {
    const alwaysInHours: Location = { id: 'home', label: 'Home', timezoneId: 'UTC', color: '#38BDF8', workStart: 0, workEnd: 24 };
    const notQuiteAligned = new Date('2026-01-01T15:07:00.000Z');

    const result = findBestMeetingOffset(notQuiteAligned, alwaysInHours, []);

    expect(result.offsetMs).toBe(8 * 60_000); // 15:07 -> next boundary 15:15
  });

  it('with no rings at all, is trivially perfect at home\'s own next in-hours moment', () => {
    const result = findBestMeetingOffset(NOW, HOME, []);
    expect(result.totalCount).toBe(1);
    expect(result.perfectCount).toBe(1);
  });

  // Bug 2 regression: a city whose strict working hours ended a few minutes
  // ago (but who is still inside its STRETCH_HOURS buffer right now) has no
  // representation in getNextWorkingWindow's output at all -- that function only
  // ever returns the city's NEXT strict window, which for `ring` here is
  // tomorrow. Without the offset-0 override, the sweep never even considers
  // "now" as a candidate for `ring`, so it picks a future offset that fits
  // only `home`, even though staying at "now" (offset 0) fits both cities via
  // their stretch buffers -- and is also the earliest possible time.
  it('prefers offset 0 over a swept-forward offset when "now" already fits more cities via stretch buffers', () => {
    const bugRepro = new Date('2026-01-01T08:07:00.000Z');
    const home: Location = { id: 'home', label: 'Home', timezoneId: 'UTC', color: '#38BDF8', workStart: 9, workEnd: 17 };
    // ring's strict window [7, 8) ended 7 minutes ago; "now" (frac ~8.12) is
    // still inside ring's stretched range [6, 9).
    const ring: Location = { id: 'ring', label: 'Ring', timezoneId: 'UTC', color: '#FB7185', workStart: 7, workEnd: 8 };

    const result = findBestMeetingOffset(bugRepro, home, [ring]);

    expect(result.offsetMs).toBe(0);
    expect(result.fitCount).toBe(2);
    expect(result.perfectCount).toBe(0);
    expect(result.cityResults).toEqual([
      { id: 'home', status: 'stretched' },
      { id: 'ring', status: 'stretched' },
    ]);
  });

  // Bug 1 regression: the overlap window between `home` and `ring` ends at
  // an offset that is bit-for-bit identical to what quarter-hour snapping
  // computes for that same instant (verified via brute-force search over
  // (now, workStart, workEnd) combinations -- most nearby candidates only
  // land *close* to the boundary due to floating-point noise in the
  // getCityTime/getNextWorkingWindow path, not exactly on it, which is why an
  // earlier version of this test was vacuous: both the buggy `<=` guard and
  // the fixed `<` guard took the same "accept" branch for it).
  //
  // now = 00:47:00.000Z, home = [0, 1), ring = [0.8, 1.8): home's strict
  // window is [0h, 0.21666666666666667h) (1 - 47/60, computed by
  // subtraction in getNextWorkingWindow); ring's strict window is
  // [0.01666666666666572h, 1.0166666666666657h) (48min - 47min, via the
  // hoursUntilStart modulo path). Their overlap -- the sweep's winner -- is
  // exactly home's endOffsetHours. Snapping that winner's start
  // (0.01666666666666572h, i.e. 00:48:00.000Z) forward to the next
  // quarter-hour boundary (01:00:00.000Z) yields a snappedOffsetHours of
  // 0.21666666666666667 -- the *same* float bits as the window's
  // endOffsetHours (confirmed with `===`, not just numeric closeness).
  //
  // Under the buggy `<=` guard that lands-on-the-end value is accepted, so
  // the meeting is placed at 01:00:00.000Z: home is no longer inside its
  // [0, 1) window there (exclusive end) and gets wrongly downgraded from
  // 'in-hours' to 'stretched'. Under the fixed `<` guard the boundary is
  // correctly treated as overshoot, so it falls back to the window's
  // (unsnapped) start of 00:48:00.000Z, where home is genuinely still
  // 'in-hours'. Neither branch triggers the offset-0 "prefer now" override
  // or the stretch-fallback pass (both were checked to behave identically
  // whichever guard is used here), so this test exercises only the guard
  // itself.
  it('does not downgrade a city when snapping forward would land exactly on its exclusive workEnd boundary', () => {
    const now = new Date('2026-01-01T00:47:00.000Z');
    const home: Location = { id: 'home', label: 'Home', timezoneId: 'UTC', color: '#38BDF8', workStart: 0, workEnd: 1 };
    const ring: Location = { id: 'ring', label: 'Ring', timezoneId: 'UTC', color: '#FB7185', workStart: 0.8, workEnd: 1.8 };

    const result = findBestMeetingOffset(now, home, [ring]);

    expect(result.offsetMs).toBe(60_000); // falls back to the window's start (00:48:00.000Z), not the boundary (01:00:00.000Z)
    expect(result.cityResults).toEqual([
      { id: 'home', status: 'in-hours' },
      { id: 'ring', status: 'in-hours' },
    ]);
  });

  // Home-priority regression: reported live -- a user with home + 4 rings
  // all on 9-18 workdays, searching in the evening (home already well past
  // its stretched workday), got back a time where home itself was 'out' (the
  // three most mutually-overlapping rings won the unconstrained sweep) even
  // though a later time existed where home fits and 2 of those rings still
  // fit. The search must never trade away home's own fit for a higher ring
  // count.
  it('never returns a time where home is out of hours, even if that time would fit more rings', () => {
    const now = new Date('2026-01-01T19:47:00.000Z'); // evening UTC, well past a 9-18 UTC workday
    const home: Location = { id: 'home', label: 'Home', timezoneId: 'UTC', color: '#38BDF8', workStart: 9, workEnd: 18 };
    // both rings overlap heavily with each other overnight UTC (their own
    // 9-18 workday, shifted 12h away), but not with home's next-day 9-18 slot
    const ringA: Location = { id: 'ring-a', label: 'Ring A', timezoneId: 'Etc/GMT-12', color: '#FB7185', workStart: 9, workEnd: 18 };
    const ringB: Location = { id: 'ring-b', label: 'Ring B', timezoneId: 'Etc/GMT-11', color: '#FBBF4B', workStart: 9, workEnd: 18 };

    const result = findBestMeetingOffset(now, home, [ringA, ringB]);

    expect(result.cityResults.find((c) => c.id === 'home')?.status).not.toBe('out');
  });

  // Second-cycle regression: home's own next occurrence can be far enough
  // away (up to ~36h) that a ring's *immediate* next occurrence lands on the
  // wrong day relative to home's, even though the ring's following occurrence
  // genuinely overlaps home's stretched window. Reported live: home (Tel
  // Aviv-like, UTC+3) and a ring (SF-like, UTC-7) on identical 9-18 workdays
  // -- home's own next occurrence is tomorrow's (it's currently well past
  // today's hours), while the ring is mid-way through *today's* occurrence;
  // those two single occurrences never overlap, but the ring's occurrence
  // the day after does, in the hour where home's stretched workday is just
  // ending (18:00) and the ring's stretched workday is just starting (8:00).
  it('finds an overlap on a ring\'s following-day occurrence when its immediate next occurrence lands on the wrong day relative to home', () => {
    const now = new Date('2026-01-01T20:00:00.000Z');
    const home: Location = { id: 'home', label: 'Home', timezoneId: 'Etc/GMT-3', color: '#38BDF8', workStart: 9, workEnd: 18 };
    const ring: Location = { id: 'ring', label: 'Ring', timezoneId: 'Etc/GMT+7', color: '#FB7185', workStart: 9, workEnd: 18 };

    const result = findBestMeetingOffset(now, home, [ring]);

    expect(result.offsetMs).toBe(19 * 60 * 60_000); // lands at 15:00 UTC next day: home 18:00 (just inside its stretched end), ring 08:00 (just at its stretched start)
    expect(result.fitCount).toBe(2);
    expect(result.cityResults).toEqual([
      { id: 'home', status: 'stretched' },
      { id: 'ring', status: 'stretched' },
    ]);
  });
});
