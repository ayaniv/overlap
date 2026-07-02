import type { RingCity } from './types';

export const DEFAULT_WORLD_CITIES: RingCity[] = [
  { id: 'san-francisco', name: 'San Francisco', timezoneId: 'America/Los_Angeles', color: '#FB7185' },
  { id: 'new-york', name: 'New York', timezoneId: 'America/New_York', color: '#FBBF4B' },
  { id: 'london', name: 'London', timezoneId: 'Europe/London', color: '#34D399' },
  { id: 'sydney', name: 'Sydney', timezoneId: 'Australia/Sydney', color: '#A78BFA' },
];

export const DEFAULT_HOME_CITY: RingCity = {
  id: 'tel-aviv',
  name: 'Tel Aviv',
  timezoneId: 'Asia/Jerusalem',
  color: '#38BDF8',
};

export const DEFAULT_WORK_START = 9;
export const DEFAULT_WORK_END = 18;
