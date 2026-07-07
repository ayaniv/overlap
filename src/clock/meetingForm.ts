import type { Meeting } from './types';

// validates form input before it becomes a Meeting; returns a user-facing error
// message, or null when the input is ready to submit
export function validateMeetingTitle(title: string): string | null {
  if (!title.trim()) return 'Title is required.';
  return null;
}

// kebab-numbered id disambiguated against existing meeting ids, mirroring buildLocationId
function buildMeetingId(existingIds: string[]): string {
  let n = existingIds.length + 1;
  let id = `meeting-${n}`;
  while (existingIds.includes(id)) {
    n++;
    id = `meeting-${n}`;
  }
  return id;
}

// callers must run validateMeetingTitle first
export function buildMeeting(title: string, instant: Date, existingIds: string[]): Meeting {
  return { id: buildMeetingId(existingIds), startISO: instant.toISOString(), title: title.trim() };
}

const pad = (n: number) => String(n).padStart(2, '0');

// formats a Date as the value a <input type="date"> expects, in local time
export function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// combines a <input type="date"> value (the day) with an existing instant's time-of-day
// (hours/minutes/seconds) — picking a date never silently resets the time the user
// already dialed in by scrubbing. Returns null (letting the caller log) for an
// unparseable value rather than an Invalid Date.
export function withDatePart(value: string, timeSource: Date): Date | null {
  const match = DATE_INPUT_PATTERN.exec(value);
  if (!match) return null;
  const [, yearStr, monthStr, dayStr] = match;
  const combined = new Date(timeSource);
  combined.setFullYear(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
  return Number.isNaN(combined.getTime()) ? null : combined;
}

// HH:MM in the browser's local time — a read-only readout next to the date picker,
// since the time itself is set by scrubbing the rings, not typed
export function formatLocalTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// compact label for a duration-picker button: whole hours read as "1h", everything
// else (including sub-hour amounts) reads as minutes, e.g. 45 -> "45m"
export function formatDurationLabel(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
}
