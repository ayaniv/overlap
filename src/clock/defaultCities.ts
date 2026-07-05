import type { Location } from './types';

export const DEFAULT_WORK_START = 9;
export const DEFAULT_WORK_END = 18;

// predefined swatches offered in the location color picker (M2), also used for defaults
export const PALETTE: string[] = [
  '#FB7185',
  '#FBBF4B',
  '#34D399',
  '#38BDF8',
  '#A78BFA',
  '#F472B6',
  '#FCD34D',
  '#4ADE80',
];

export const DEFAULT_WORLD_CITIES: Location[] = [
  {
    id: 'san-francisco',
    label: 'San Francisco',
    timezoneId: 'America/Los_Angeles',
    color: '#FB7185',
    workStart: DEFAULT_WORK_START,
    workEnd: DEFAULT_WORK_END,
  },
  {
    id: 'new-york',
    label: 'New York',
    timezoneId: 'America/New_York',
    color: '#FBBF4B',
    workStart: DEFAULT_WORK_START,
    workEnd: DEFAULT_WORK_END,
  },
  {
    id: 'london',
    label: 'London',
    timezoneId: 'Europe/London',
    color: '#34D399',
    workStart: DEFAULT_WORK_START,
    workEnd: DEFAULT_WORK_END,
  },
  {
    id: 'sydney',
    label: 'Sydney',
    timezoneId: 'Australia/Sydney',
    color: '#A78BFA',
    workStart: DEFAULT_WORK_START,
    workEnd: DEFAULT_WORK_END,
  },
];

export const DEFAULT_HOME_CITY: Location = {
  id: 'tel-aviv',
  label: 'Tel Aviv',
  timezoneId: 'Asia/Jerusalem',
  color: '#38BDF8',
  workStart: DEFAULT_WORK_START,
  workEnd: DEFAULT_WORK_END,
};
