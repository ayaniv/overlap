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

type SweepEvent = { hours: number; delta: 1 | -1 };

// classic "point of maximum overlap" sweep: +1 at every window's start, -1 at
// every end. Walking the sorted events with a running total finds both how
// many windows are simultaneously active at any point, and the earliest
// point (plus that run's end) where the count is at its max. End events sort
// before start events at an exact tie, matching isWithinWorkingHours' own
// half-open [start, end) convention — a window that ends exactly when
// another starts isn't "active" at that shared instant.
export function sweepMaxOverlap(windows: CityWindow[]): { startOffsetHours: number; endOffsetHours: number; count: number } {
  const events: SweepEvent[] = windows.flatMap((w) => [
    { hours: w.startOffsetHours, delta: 1 as const },
    { hours: w.endOffsetHours, delta: -1 as const },
  ]);
  events.sort((a, b) => a.hours - b.hours || a.delta - b.delta);

  let running = 0;
  let best = { startOffsetHours: 0, endOffsetHours: 0, count: 0 };
  for (let i = 0; i < events.length; i++) {
    running += events[i].delta;
    if (running > best.count) {
      const endOffsetHours = i + 1 < events.length ? events[i + 1].hours : events[i].hours;
      best = { startOffsetHours: events[i].hours, endOffsetHours, count: running };
    }
  }
  return best;
}
