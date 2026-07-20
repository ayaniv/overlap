import { getCityTime, isWithinWorkingHours } from './cityTime';
import type { Location } from './types';

export type CityWindow = {
  id: string;
  startOffsetHours: number;
  endOffsetHours: number;
};

// hours-from-now interval during which `location` is next inside its normal
// working hours. A city already inside its hours right now gets a window
// starting at 0 (now) rather than "tomorrow" — its current stretch of
// in-hours time is exactly what a meeting right now would land inside of.
export function nextWorkingWindow(now: Date, location: Location): CityWindow {
  const { frac } = getCityTime(now, location.timezoneId);
  const { workStart, workEnd } = location;
  if (isWithinWorkingHours(frac, workStart, workEnd)) {
    return { id: location.id, startOffsetHours: 0, endOffsetHours: workEnd - frac };
  }
  const hoursUntilStart = (((workStart - frac) % 24) + 24) % 24;
  return { id: location.id, startOffsetHours: hoursUntilStart, endOffsetHours: hoursUntilStart + (workEnd - workStart) };
}

// widens a window by `hours` on each side, never letting the start go before
// "now" (offset 0) — a meeting can't be scheduled in the past.
export function widenWindow(window: CityWindow, hours: number): CityWindow {
  return {
    id: window.id,
    startOffsetHours: Math.max(0, window.startOffsetHours - hours),
    endOffsetHours: window.endOffsetHours + hours,
  };
}
