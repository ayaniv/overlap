import type { ClockConfig, Location, Meeting } from './types';

// runtime shape guards for ClockConfig parsed from an untrusted source (a share
// link's URL hash, or a localStorage value from an older/foreign schema) — a
// value that is valid JSON but the wrong shape must be rejected here, not left
// to fail later deep in render
function isLocation(value: unknown): value is Location {
  if (typeof value !== 'object' || value === null) return false;
  const location = value as Record<string, unknown>;
  return (
    typeof location.id === 'string' &&
    typeof location.label === 'string' &&
    typeof location.timezoneId === 'string' &&
    typeof location.color === 'string' &&
    typeof location.workStart === 'number' &&
    typeof location.workEnd === 'number'
  );
}

function isMeeting(value: unknown): value is Meeting {
  if (typeof value !== 'object' || value === null) return false;
  const meeting = value as Record<string, unknown>;
  return (
    typeof meeting.id === 'string' &&
    typeof meeting.startISO === 'string' &&
    typeof meeting.title === 'string' &&
    (meeting.googleEventId === undefined || typeof meeting.googleEventId === 'string')
  );
}

export function isValidClockConfig(value: unknown): value is ClockConfig {
  if (typeof value !== 'object' || value === null) return false;
  const config = value as Record<string, unknown>;
  return (
    isLocation(config.home) &&
    Array.isArray(config.rings) &&
    config.rings.every(isLocation) &&
    Array.isArray(config.meetings) &&
    config.meetings.every(isMeeting)
  );
}
