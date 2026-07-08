import { parseMeetingInstant } from './geometry';
import type { Meeting } from './types';

// validates form input before it becomes a Meeting; returns a user-facing error
// message, or null when the input is ready to submit
export function validateMeetingTitle(title: string): string | null {
  if (!title.trim()) return 'Title is required.';
  return null;
}

// kebab-numbered id disambiguated against existing meeting ids, mirroring buildLocationId
function buildMeetingId(existingIds: string[]): string {
  let suffix = existingIds.length + 1;
  let id = `meeting-${suffix}`;
  while (existingIds.includes(id)) {
    suffix++;
    id = `meeting-${suffix}`;
  }
  return id;
}

// callers must run validateMeetingTitle first
export function buildMeeting(title: string, instant: Date, existingIds: string[], googleEventId?: string): Meeting {
  const meeting: Meeting = { id: buildMeetingId(existingIds), startISO: instant.toISOString(), title: title.trim() };
  return googleEventId ? { ...meeting, googleEventId } : meeting;
}

// matches `instant` against `meetings` by actual time proximity (within
// `toleranceMs`), not exact equality — scrubbing (especially a continuous drag)
// rarely lands on the exact millisecond a meeting was scheduled at. Returns the
// closest match within tolerance, so two meetings a minute apart don't flicker
// between each other as the preview moves.
export function findMeetingAtInstant(meetings: Meeting[], instant: Date, toleranceMs: number): Meeting | undefined {
  let closest: Meeting | undefined;
  let closestDeltaMs = Infinity;
  for (const meeting of meetings) {
    const meetingInstant = parseMeetingInstant(meeting.startISO);
    if (!meetingInstant) continue;
    const deltaMs = Math.abs(meetingInstant.getTime() - instant.getTime());
    if (deltaMs <= toleranceMs && deltaMs < closestDeltaMs) {
      closest = meeting;
      closestDeltaMs = deltaMs;
    }
  }
  return closest;
}

const padTwoDigits = (value: number) => String(value).padStart(2, '0');

// formats a Date as the value a <input type="date"> expects, in local time
export function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${padTwoDigits(date.getMonth() + 1)}-${padTwoDigits(date.getDate())}`;
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
  return `${padTwoDigits(date.getHours())}:${padTwoDigits(date.getMinutes())}`;
}

// compact label for a duration-picker button: whole hours read as "1h", everything
// else (including sub-hour amounts) reads as minutes, e.g. 45 -> "45m"
export function formatDurationLabel(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
}

// "Wed, Jan 1 · 09:45" — the scheduled instant, shown in the post-submit success note
// so the confirmation states what was actually booked, not just that something was
export function formatScheduledSummary(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).formatToParts(date);
  let weekday = '';
  let month = '';
  let day = '';
  for (const part of parts) {
    if (part.type === 'weekday') weekday = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
  }
  return `${weekday}, ${month} ${day} · ${formatLocalTime(date)}`;
}
