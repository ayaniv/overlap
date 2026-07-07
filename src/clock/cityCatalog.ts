import { getTimeZones } from '@vvo/tzdb';

export type CityEntry = {
  label: string;
  timezoneId: string;
  country: string;
};

const SUGGESTION_LIMIT = 8;

// flattens tzdb's per-timezone main cities into one searchable, alphabetized list
function buildCityCatalog(): CityEntry[] {
  const entries: CityEntry[] = [];
  for (const zone of getTimeZones()) {
    for (const city of zone.mainCities) {
      entries.push({ label: city, timezoneId: zone.name, country: zone.countryName });
    }
  }
  return entries.sort((a, b) => a.label.localeCompare(b.label));
}

// built once at module load from the bundled tzdb dataset (~1k entries)
export const CITY_CATALOG: CityEntry[] = buildCityCatalog();

// prefix matches first, then other substring matches, so typing "san" surfaces
// "San Francisco" ahead of a city that merely contains "san" mid-word
export function searchCities(query: string, limit = SUGGESTION_LIMIT): CityEntry[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const prefixMatches: CityEntry[] = [];
  const otherMatches: CityEntry[] = [];
  for (const entry of CITY_CATALOG) {
    const label = entry.label.toLowerCase();
    if (label.startsWith(trimmed)) prefixMatches.push(entry);
    else if (label.includes(trimmed)) otherMatches.push(entry);
  }
  return prefixMatches.concat(otherMatches).slice(0, limit);
}
