import type { Location } from './types';

export const DEFAULT_WORK_START = 9;
export const DEFAULT_WORK_END = 18;

// predefined swatches offered in the location color picker (M2), also used for defaults.
// Every entry needs to read as a distinct hue at a glance — these are drawn as thin glowing
// ring strokes on a near-black background, where two swatches from the same family (e.g. the
// original #FCD34D next to #FBBF4B, or #4ADE80 next to #34D399) become genuinely hard to tell
// apart rather than just "similar in isolation". A first replacement attempt (cyan #22D3EE,
// orange #FB923C) turned out to repeat the same mistake one hue-step over — Tailwind's
// cyan-400/sky-400 and orange-400/amber-400 are themselves neighboring hues (~10-15° apart
// on the hue circle). Lime and fuchsia below were chosen by actually computing hue distance
// against all six other entries (not eyeballing swatches): both land 37-44° from their
// closest neighbor, comfortably past the ~23° gap already tolerated between the existing
// rose/pink pair. Eight hues, no two sharing a family: rose, amber, emerald, sky, violet,
// pink, lime, fuchsia.
export const PALETTE: string[] = [
  '#FB7185',
  '#FBBF4B',
  '#34D399',
  '#38BDF8',
  '#A78BFA',
  '#F472B6',
  '#A3E635',
  '#E879F9',
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
