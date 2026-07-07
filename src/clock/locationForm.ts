import type { CityEntry } from './cityCatalog';
import { PALETTE } from './defaultCities';
import type { Location } from './types';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// shared with AddLocationForm's hour inputs so the widget and the validator
// can never disagree on the valid range
export const MIN_WORK_START = 0;
export const MAX_WORK_START = 23;
export const MIN_WORK_END = 1;
export const MAX_WORK_END = 24;

export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value.trim());
}

// suggests a palette swatch not already used by an existing location, so
// newly added rings default to visually distinct colors; falls back to any
// palette color once every swatch is already taken
export function pickAvailableColor(usedColors: string[]): string {
  const unused = PALETTE.filter((color) => !usedColors.includes(color));
  const pool = unused.length > 0 ? unused : PALETTE;
  return pool[Math.floor(Math.random() * pool.length)];
}

// kebab-case id derived from the label, disambiguated against existing ids so
// two locations sharing a name (or a repeat add) never collide
export function buildLocationId(label: string, existingIds: string[]): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'location';
  if (!existingIds.includes(base)) return base;

  let suffix = 2;
  while (existingIds.includes(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

export type NewLocationInput = {
  city: CityEntry | null;
  label: string;
  color: string;
  workStart: number;
  workEnd: number;
};

// validates form input before it becomes a Location; returns a user-facing
// error message, or null when the input is ready to submit
export function validateNewLocation(input: NewLocationInput): string | null {
  if (!input.city) return 'Pick a city from the list.';
  if (!input.label.trim()) return 'Label is required.';
  if (!isValidHexColor(input.color)) return 'Color must be a hex value like #38BDF8.';
  if (!Number.isInteger(input.workStart) || input.workStart < MIN_WORK_START || input.workStart > MAX_WORK_START) {
    return `Start hour must be between ${MIN_WORK_START} and ${MAX_WORK_START}.`;
  }
  if (!Number.isInteger(input.workEnd) || input.workEnd < MIN_WORK_END || input.workEnd > MAX_WORK_END) {
    return `End hour must be between ${MIN_WORK_END} and ${MAX_WORK_END}.`;
  }
  if (input.workStart >= input.workEnd) return 'Start hour must be before end hour.';
  return null;
}

// callers must run validateNewLocation first; throws on misuse (no city
// selected) rather than silently producing a broken Location
export function buildNewLocation(input: NewLocationInput, existingIds: string[]): Location {
  if (!input.city) throw new Error('overlap: cannot build a location without a selected city');
  return {
    id: buildLocationId(input.label || input.city.label, existingIds),
    label: input.label.trim() || input.city.label,
    timezoneId: input.city.timezoneId,
    color: input.color,
    workStart: input.workStart,
    workEnd: input.workEnd,
  };
}
