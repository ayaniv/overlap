import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLocationId, buildNewLocation, clampWorkEnd, clampWorkStart, isValidHexColor, pickAvailableColor, validateNewLocation } from './locationForm';
import type { NewLocationInput } from './locationForm';
import type { CityEntry } from './cityCatalog';
import { PALETTE } from './defaultCities';

const TOKYO: CityEntry = { label: 'Tokyo', timezoneId: 'Asia/Tokyo', country: 'Japan' };

const VALID_INPUT: NewLocationInput = { city: TOKYO, label: 'Tokyo', color: '#38BDF8', workStart: 9, workEnd: 18 };

describe('isValidHexColor', () => {
  it('accepts a 6-digit hex color', () => {
    expect(isValidHexColor('#38BDF8')).toBe(true);
    expect(isValidHexColor('#000000')).toBe(true);
  });

  it('rejects malformed values', () => {
    expect(isValidHexColor('38BDF8')).toBe(false);
    expect(isValidHexColor('#38B')).toBe(false);
    expect(isValidHexColor('#GGGGGG')).toBe(false);
    expect(isValidHexColor('')).toBe(false);
  });
});

describe('pickAvailableColor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never returns a color already in use when unused ones remain', () => {
    const usedColors = PALETTE.slice(0, PALETTE.length - 1);
    const remaining = PALETTE[PALETTE.length - 1];
    expect(pickAvailableColor(usedColors)).toBe(remaining);
  });

  it('picks among all unused colors (deterministic via a mocked Math.random)', () => {
    const usedColors = [PALETTE[0]];
    const unused = PALETTE.slice(1);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(pickAvailableColor(usedColors)).toBe(unused[0]);
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(pickAvailableColor(usedColors)).toBe(unused[unused.length - 1]);
  });

  it('falls back to the full palette once every swatch is already used', () => {
    expect(PALETTE).toContain(pickAvailableColor(PALETTE));
  });

  it('returns a palette color when nothing is in use yet', () => {
    expect(PALETTE).toContain(pickAvailableColor([]));
  });
});

describe('buildLocationId', () => {
  it('slugifies the label', () => {
    expect(buildLocationId('Tokyo', [])).toBe('tokyo');
    expect(buildLocationId('San Francisco', [])).toBe('san-francisco');
  });

  it('disambiguates against existing ids', () => {
    expect(buildLocationId('Tokyo', ['tokyo'])).toBe('tokyo-2');
    expect(buildLocationId('Tokyo', ['tokyo', 'tokyo-2'])).toBe('tokyo-3');
  });

  it('falls back to "location" for a label with no alphanumeric characters', () => {
    expect(buildLocationId('###', [])).toBe('location');
  });
});

describe('validateNewLocation', () => {
  it('accepts valid input', () => {
    expect(validateNewLocation(VALID_INPUT)).toBeNull();
  });

  it('requires a selected city', () => {
    expect(validateNewLocation({ ...VALID_INPUT, city: null })).toMatch(/city/i);
  });

  it('requires a non-empty label', () => {
    expect(validateNewLocation({ ...VALID_INPUT, label: '   ' })).toMatch(/label/i);
  });

  it('rejects an invalid color', () => {
    expect(validateNewLocation({ ...VALID_INPUT, color: 'blue' })).toMatch(/color/i);
  });

  it('rejects work hours out of range', () => {
    expect(validateNewLocation({ ...VALID_INPUT, workStart: -1 })).toMatch(/hour/i);
    expect(validateNewLocation({ ...VALID_INPUT, workEnd: 25 })).toMatch(/hour/i);
  });

  it('rejects a start hour that is not before the end hour', () => {
    expect(validateNewLocation({ ...VALID_INPUT, workStart: 18, workEnd: 9 })).toMatch(/before/i);
    expect(validateNewLocation({ ...VALID_INPUT, workStart: 9, workEnd: 9 })).toMatch(/before/i);
  });
});

describe('clampWorkStart', () => {
  it('passes through a value already within range and before End', () => {
    expect(clampWorkStart(10, 18)).toBe(10);
  });

  it('never allows a value above 23, the max Start hour', () => {
    expect(clampWorkStart(30, 24)).toBe(23);
  });

  it('never allows a value below 0', () => {
    expect(clampWorkStart(-5, 18)).toBe(0);
  });

  it('never allows Start to reach or exceed the paired End hour', () => {
    expect(clampWorkStart(18, 18)).toBe(17);
    expect(clampWorkStart(20, 18)).toBe(17);
  });

  it('rounds a non-integer input', () => {
    expect(clampWorkStart(9.6, 18)).toBe(10);
  });

  it('falls back to the minimum for a non-finite input', () => {
    expect(clampWorkStart(NaN, 18)).toBe(0);
  });

  it('allows Start=0 when End is at its maximum of 24 (full-day span)', () => {
    expect(clampWorkStart(0, 24)).toBe(0);
  });
});

describe('clampWorkEnd', () => {
  it('passes through a value already within range and after Start', () => {
    expect(clampWorkEnd(18, 9)).toBe(18);
  });

  it('never allows a value above 24, the max End hour', () => {
    expect(clampWorkEnd(30, 9)).toBe(24);
  });

  it('never allows a value below 1', () => {
    expect(clampWorkEnd(-5, 0)).toBe(1);
  });

  it('never allows End to reach or drop below the paired Start hour', () => {
    expect(clampWorkEnd(9, 9)).toBe(10);
    expect(clampWorkEnd(5, 9)).toBe(10);
  });

  it('rounds a non-integer input', () => {
    expect(clampWorkEnd(18.4, 9)).toBe(18);
  });

  it('falls back to the maximum for a non-finite input', () => {
    expect(clampWorkEnd(NaN, 9)).toBe(24);
  });

  it('allows End=24 when Start is 0 (full-day span)', () => {
    expect(clampWorkEnd(24, 0)).toBe(24);
  });
});

describe('buildNewLocation', () => {
  it('builds a Location from valid input', () => {
    expect(buildNewLocation(VALID_INPUT, ['san-francisco'])).toEqual({
      id: 'tokyo',
      label: 'Tokyo',
      timezoneId: 'Asia/Tokyo',
      color: '#38BDF8',
      workStart: 9,
      workEnd: 18,
    });
  });

  it('disambiguates the id against existing ids', () => {
    expect(buildNewLocation(VALID_INPUT, ['tokyo']).id).toBe('tokyo-2');
  });

  it('throws when no city is selected', () => {
    expect(() => buildNewLocation({ ...VALID_INPUT, city: null }, [])).toThrow();
  });
});
