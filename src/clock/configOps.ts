import type { ClockConfig, Location, Meeting } from './types';

// pure ClockConfig transitions, kept separate from useClockConfig so they're
// testable without touching window/localStorage
export function setHomeOp(config: ClockConfig, home: Location): ClockConfig {
  return { ...config, home };
}

export function addLocationOp(config: ClockConfig, location: Location): ClockConfig {
  return { ...config, rings: [...config.rings, location] };
}

export function removeLocationOp(config: ClockConfig, id: string): ClockConfig {
  return { ...config, rings: config.rings.filter((location) => location.id !== id) };
}

export function updateLocationOp(config: ClockConfig, id: string, patch: Partial<Location>): ClockConfig {
  return {
    ...config,
    rings: config.rings.map((location) => (location.id === id ? { ...location, ...patch } : location)),
  };
}

export function addMeetingOp(config: ClockConfig, meeting: Meeting): ClockConfig {
  return { ...config, meetings: [...config.meetings, meeting] };
}
