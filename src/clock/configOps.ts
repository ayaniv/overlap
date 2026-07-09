import type { ClockConfig, Location, Meeting } from './types';

// pure ClockConfig transitions, kept separate from useClockConfig so they're
// testable without touching window/localStorage
// swaps home for one of the current rings: the outgoing home slides into the
// chosen ring's old slot (mirrors addLocationOp/removeLocationOp's id-based
// approach) so no location is ever dropped. Only `home.id` is trusted for the
// lookup — the new home stored is always the canonical ring object from
// `config.rings`, not the passed-in `home` value itself, since callers like
// ManageLocationsList pass their own display copy of a location (spread with
// an extra `isHome` flag for rendering) that shouldn't leak into persisted
// config.
export function setHomeOp(config: ClockConfig, home: Location): ClockConfig {
  if (home.id === config.home.id) return config;
  const ringIndex = config.rings.findIndex((location) => location.id === home.id);
  if (ringIndex === -1) {
    console.error('overlap: setHomeOp given a location that is not a current ring', home.id);
    return config;
  }
  const rings = [...config.rings];
  const newHome = rings[ringIndex];
  rings[ringIndex] = config.home;
  return { ...config, home: newHome, rings };
}

// reorders the full home+rings id list (inside->outside); if `orderedIds[0]`
// names a different location than the current home, that location becomes
// home (reusing setHomeOp) while every other location keeps the relative
// inside->outside order the caller asked for
export function reorderLocationsOp(config: ClockConfig, orderedIds: string[]): ClockConfig {
  const allLocations = [config.home, ...config.rings];
  const pool = new Map(allLocations.map((location) => [location.id, location]));
  const isValidOrder =
    orderedIds.length === allLocations.length && new Set(orderedIds).size === orderedIds.length && orderedIds.every((id) => pool.has(id));
  if (!isValidOrder) {
    console.error('overlap: reorderLocationsOp given an invalid id order', orderedIds);
    return config;
  }

  const [newHomeId, ...restIds] = orderedIds;
  const newRings = restIds.map((id) => pool.get(id) as Location).reverse();

  if (newHomeId === config.home.id) {
    return { ...config, rings: newRings };
  }

  const swapped = setHomeOp(config, pool.get(newHomeId) as Location);
  return { ...swapped, rings: newRings };
}

// new locations go first in `rings` so they land on the outermost ring
// (WorldClock draws rings[0] outermost, home innermost) — existing rings'
// radii are unaffected, only the outer edge grows
export function addLocationOp(config: ClockConfig, location: Location): ClockConfig {
  return { ...config, rings: [location, ...config.rings] };
}

export function removeLocationOp(config: ClockConfig, id: string): ClockConfig {
  return { ...config, rings: config.rings.filter((location) => location.id !== id) };
}

// `id` can name either a ring or the current home — home lives in its own
// `config.home` field, not the `rings` array, so it needs its own branch here.
// Editing home's color/hours previously did nothing at all: this only ever
// mapped over `rings`, silently dropping the patch whenever `id` was home's.
export function updateLocationOp(config: ClockConfig, id: string, patch: Partial<Location>): ClockConfig {
  if (config.home.id === id) {
    return { ...config, home: { ...config.home, ...patch } };
  }
  return {
    ...config,
    rings: config.rings.map((location) => (location.id === id ? { ...location, ...patch } : location)),
  };
}

export function addMeetingOp(config: ClockConfig, meeting: Meeting): ClockConfig {
  return { ...config, meetings: [...config.meetings, meeting] };
}

export function removeMeetingOp(config: ClockConfig, id: string): ClockConfig {
  return { ...config, meetings: config.meetings.filter((meeting) => meeting.id !== id) };
}
