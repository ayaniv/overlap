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

// formats a Date as the value a <input type="datetime-local"> expects, in local time
export function toDatetimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// parses a <input type="datetime-local"> value back into a Date; returns null (and lets
// the caller decide whether to log) for an empty or unparseable value rather than an
// Invalid Date
export function fromDatetimeLocalValue(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
