import { describe, expect, it } from 'vitest';
import { buildLocationId, buildNewLocation, isValidHexColor, validateNewLocation } from './locationForm';
import type { NewLocationInput } from './locationForm';
import type { CityEntry } from './cityCatalog';

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
