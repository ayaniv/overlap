import { describe, expect, it, vi } from 'vitest';
import { createCityCatalogLoader, FALLBACK_CITIES, loadCityCatalog, searchCityList } from './cityCatalog';
import type { CityEntry } from './cityCatalog';

function city(label: string, population: number, overrides: Partial<CityEntry> = {}): CityEntry {
  return { label, timezoneId: 'Etc/UTC', country: 'Testland', region: 'Testshire', population, ...overrides };
}

describe('searchCityList', () => {
  it('is case-insensitive and ignores surrounding whitespace', () => {
    const results = searchCityList([city('Tokyo', 1)], '  tOKYo ');
    expect(results.map((entry) => entry.label)).toEqual(['Tokyo']);
  });

  it('ranks prefix matches before mid-word matches, even when the mid-word city is bigger', () => {
    const results = searchCityList([city('Busan', 9_000_000), city('San Jose', 1_000)], 'san');
    expect(results.map((entry) => entry.label)).toEqual(['San Jose', 'Busan']);
  });

  it('ranks an exact name match before larger cities that merely start with the query', () => {
    const results = searchCityList([city('Bostonia Megacity', 50_000_000), city('Boston', 600_000)], 'boston');
    expect(results[0].label).toBe('Boston');
  });

  it('ranks by population within a tier', () => {
    const results = searchCityList([city('Salem', 10), city('Salford', 500), city('Salt Lake City', 200)], 'sal');
    expect(results.map((entry) => entry.label)).toEqual(['Salford', 'Salt Lake City', 'Salem']);
  });

  it('treats the part before a comma as the name, so "Washington, D.C." is an exact match for "washington"', () => {
    const results = searchCityList(
      [city('Washington', 10_000, { region: 'Pennsylvania' }), city('Washington, D.C.', 2_400_000), city('Seattle', 700_000, { region: 'Washington' })],
      'washington',
    );
    expect(results[0].label).toBe('Washington, D.C.');
    expect(results.map((entry) => entry.label)).not.toContain('Seattle');
  });

  it('returns an empty list for blank input', () => {
    expect(searchCityList([city('Tokyo', 1)], '   ')).toEqual([]);
    expect(searchCityList([city('Tokyo', 1)], '')).toEqual([]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(searchCityList([city('Tokyo', 1)], 'zzzznotarealcityzzzz')).toEqual([]);
  });

  it('caps results at the given limit, defaulting to 8', () => {
    const many = Array.from({ length: 20 }, (_, index) => city(`Town ${index}`, index));
    expect(searchCityList(many, 'town', 3)).toHaveLength(3);
    expect(searchCityList(many, 'town')).toHaveLength(8);
  });
});

describe('loadCityCatalog (real city-timezones dataset)', () => {
  it('finds Boston with its timezone and region', async () => {
    const results = searchCityList(await loadCityCatalog(), 'boston');
    expect(results[0]).toMatchObject({ label: 'Boston', timezoneId: 'America/New_York', region: 'Massachusetts' });
  });

  it('puts Washington, D.C. first for "washington", ahead of cities in Washington state', async () => {
    const results = searchCityList(await loadCityCatalog(), 'washington');
    expect(results[0].label).toBe('Washington, D.C.');
  });

  it('has no entry without a timezone and no repeated city/timezone/region key', async () => {
    const catalog = await loadCityCatalog();
    const keys = catalog.map((entry) => `${entry.timezoneId}|${entry.label}|${entry.region}`);
    expect(catalog.every((entry) => entry.timezoneId)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns the same cached list on repeated loads', async () => {
    expect(await loadCityCatalog()).toBe(await loadCityCatalog());
  });
});

describe('createCityCatalogLoader', () => {
  const rawCities = [{ city: 'Boston', province: 'Massachusetts', country: 'United States of America', pop: 5, timezone: 'America/New_York' }];

  it('does not call the importer until the loader is invoked, and only once for repeated calls', async () => {
    const importer = vi.fn().mockResolvedValue({ cityMapping: rawCities });
    const load = createCityCatalogLoader(importer);
    expect(importer).not.toHaveBeenCalled();

    const first = await load();
    await load();

    expect(importer).toHaveBeenCalledTimes(1);
    expect(first).toEqual([
      { label: 'Boston', timezoneId: 'America/New_York', country: 'United States of America', region: 'Massachusetts', population: 5 },
    ]);
  });

  it('drops entries with no timezone and exact duplicates', async () => {
    const station = { city: 'Rothera Station', province: 'Antarctica', country: 'Antarctica', pop: 1, timezone: null };
    const importer = vi.fn().mockResolvedValue({ cityMapping: [...rawCities, station, ...rawCities] });

    const catalog = await createCityCatalogLoader(importer)();

    expect(catalog.map((entry) => entry.label)).toEqual(['Boston']);
  });

  it('rejects when the import fails, and retries on the next call instead of caching the failure', async () => {
    const importer = vi.fn().mockRejectedValueOnce(new Error('chunk failed')).mockResolvedValue({ cityMapping: rawCities });
    const load = createCityCatalogLoader(importer);

    await expect(load()).rejects.toThrow('chunk failed');
    expect(await load()).toHaveLength(1);
    expect(importer).toHaveBeenCalledTimes(2);
  });
});

describe('FALLBACK_CITIES', () => {
  it('covers the default cities so the form stays usable without the full list', () => {
    expect(searchCityList(FALLBACK_CITIES, 'london')[0]).toMatchObject({ label: 'London', timezoneId: 'Europe/London' });
  });
});
