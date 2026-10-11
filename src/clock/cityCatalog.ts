import { DEFAULT_HOME_CITY, DEFAULT_WORLD_CITIES } from './defaultCities';

export type CityEntry = {
  label: string;
  timezoneId: string;
  // not shown in the UI; kept because the location_added analytics event reads it
  country: string;
  // state/province, shown next to the city to tell same-named cities apart
  region: string;
  population: number;
};

// the subset of city-timezones' CityData this module reads
type RawCity = {
  city: string;
  province: string;
  country: string;
  pop: number;
  timezone: string;
};

type CityDataset = { cityMapping: RawCity[] };

const SUGGESTION_LIMIT = 8;

// "Washington, D.C." must count as the exact city "washington", so exactness is
// judged on the name before the first comma
function getCityName(label: string): string {
  return label.split(',')[0].trim().toLowerCase();
}

// exact name match, then prefix, then other substring matches — each tier by
// population — so "san" surfaces "San Francisco" ahead of a city that merely
// contains "san", and "washington" surfaces Washington, D.C. first
export function searchCityList(cities: CityEntry[], query: string, limit = SUGGESTION_LIMIT): CityEntry[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const exactMatches: CityEntry[] = [];
  const prefixMatches: CityEntry[] = [];
  const otherMatches: CityEntry[] = [];
  for (const entry of cities) {
    const label = entry.label.toLowerCase();
    if (getCityName(entry.label) === trimmed) exactMatches.push(entry);
    else if (label.startsWith(trimmed)) prefixMatches.push(entry);
    else if (label.includes(trimmed)) otherMatches.push(entry);
  }
  const byPopulationThenLabel = (a: CityEntry, b: CityEntry) =>
    b.population - a.population || a.label.localeCompare(b.label);
  return [exactMatches, prefixMatches, otherMatches]
    .flatMap((tier) => tier.sort(byPopulationThenLabel))
    .slice(0, limit);
}

// takes the importer as a parameter so the lazy-load and retry behavior is
// testable without the real ~2 MB dataset; a failed import is not cached, so
// the next call can retry
export function createCityCatalogLoader(importDataset: () => Promise<CityDataset>): () => Promise<CityEntry[]> {
  let pendingCatalog: Promise<CityEntry[]> | null = null;
  return () => {
    if (!pendingCatalog) {
      pendingCatalog = importDataset()
        .then(({ cityMapping }) =>
          cityMapping.map((raw) => ({
            label: raw.city,
            timezoneId: raw.timezone,
            country: raw.country,
            region: raw.province,
            population: raw.pop,
          })),
        )
        .catch((error: unknown) => {
          pendingCatalog = null;
          throw error;
        });
    }
    return pendingCatalog;
  };
}

// the dynamic import is the whole point: it makes the dataset its own chunk,
// fetched only when the Add location field is first used
export const loadCityCatalog = createCityCatalogLoader(() => import('city-timezones'));

// searched when the full list could not be loaded, so the form still offers something
export const FALLBACK_CITIES: CityEntry[] = [DEFAULT_HOME_CITY, ...DEFAULT_WORLD_CITIES].map((location) => ({
  label: location.label,
  timezoneId: location.timezoneId,
  country: '',
  region: '',
  population: 0,
}));
