import { describe, expect, it } from 'vitest';
import { searchCities } from './cityCatalog';

describe('searchCities', () => {
  it('finds San Francisco under America/Los_Angeles', () => {
    const results = searchCities('San Francisco');
    expect(results.some((entry) => entry.timezoneId === 'America/Los_Angeles')).toBe(true);
  });

  it('is case-insensitive', () => {
    const results = searchCities('tokyo');
    expect(results.some((entry) => entry.label === 'Tokyo')).toBe(true);
  });

  it('ranks prefix matches before mid-word matches', () => {
    const results = searchCities('san');
    const firstMidWordIndex = results.findIndex((entry) => !entry.label.toLowerCase().startsWith('san'));
    const lastPrefixIndex = results.map((entry) => entry.label.toLowerCase().startsWith('san')).lastIndexOf(true);
    if (firstMidWordIndex !== -1 && lastPrefixIndex !== -1) {
      expect(lastPrefixIndex).toBeLessThan(firstMidWordIndex);
    }
  });

  it('returns an empty list for blank input', () => {
    expect(searchCities('   ')).toEqual([]);
    expect(searchCities('')).toEqual([]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(searchCities('zzzznotarealcityzzzz')).toEqual([]);
  });

  it('caps results at the given limit', () => {
    expect(searchCities('a', 3).length).toBeLessThanOrEqual(3);
  });
});
