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

const CYCLE_HOURS = 24;

// like nextWorkingWindow, but one full day-cycle later — used when bounding
// the search to home's window (see findBestMeetingOffset): home's own next
// occurrence can be up to ~36h away, so a ring's *immediate* next occurrence
// might land on the wrong day relative to home's, while the ring's following
// one is actually the one that overlaps. Doesn't just add CYCLE_HOURS to
// nextWorkingWindow's result, because that result clamps a currently-in-hours
// occurrence's start to 0 (can't schedule in the past) — shifting the
// clamped value would land the next cycle up to `frac - workStart` hours too
// late. Recomputing the true (possibly negative) start before adding
// CYCLE_HOURS keeps the cycle boundary exact.
function followingWorkingWindow(now: Date, location: Location): CityWindow {
  const { frac } = getCityTime(now, location.timezoneId);
  const { workStart, workEnd } = location;
  if (isWithinWorkingHours(frac, workStart, workEnd)) {
    return { id: location.id, startOffsetHours: workStart - frac + CYCLE_HOURS, endOffsetHours: workEnd - frac + CYCLE_HOURS };
  }
  const hoursUntilStart = (((workStart - frac) % 24) + 24) % 24;
  return {
    id: location.id,
    startOffsetHours: hoursUntilStart + CYCLE_HOURS,
    endOffsetHours: hoursUntilStart + CYCLE_HOURS + (workEnd - workStart),
  };
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

export type CityFitStatus = 'in-hours' | 'stretched' | 'out';

export type CityFitResult = {
  id: string;
  status: CityFitStatus;
};

export type FindMeetingTimeResult = {
  offsetMs: number;
  perfectCount: number;
  fitCount: number;
  totalCount: number;
  cityResults: CityFitResult[];
};

export const STRETCH_HOURS = 1;
const QUARTER_HOUR_MS = 15 * 60_000;
const MS_PER_HOUR = 3_600_000;

// rounds `window.startOffsetHours` (measured from `now`) forward to the next
// quarter-hour wall-clock boundary. Every real-world UTC offset is itself a
// multiple of 15 minutes, so rounding the instant's raw minute value lands on
// a clean :00/:15/:30/:45 in every city's local clock simultaneously, not
// just one. Falls back to the unsnapped start if snapping would overshoot
// the window it was found in (only possible for a window narrower than 15
// minutes) — this includes landing exactly on the window's end, since every
// window is a half-open [start, end) interval (see isWithinWorkingHours and
// sweepMaxOverlap) and the end instant itself is not actually inside it.
function snapForwardToQuarterHour(now: Date, window: { startOffsetHours: number; endOffsetHours: number }): number {
  const candidateMs = now.getTime() + window.startOffsetHours * MS_PER_HOUR;
  const snappedMs = Math.ceil(candidateMs / QUARTER_HOUR_MS) * QUARTER_HOUR_MS;
  const snappedOffsetHours = (snappedMs - now.getTime()) / MS_PER_HOUR;
  return snappedOffsetHours < window.endOffsetHours ? snappedOffsetHours : window.startOffsetHours;
}

function classifyCity(now: Date, offsetMs: number, location: Location): CityFitStatus {
  const candidate = new Date(now.getTime() + offsetMs);
  const { frac } = getCityTime(candidate, location.timezoneId);
  const { workStart, workEnd } = location;
  if (isWithinWorkingHours(frac, workStart, workEnd)) return 'in-hours';
  if (isWithinWorkingHours(frac, Math.max(0, workStart - STRETCH_HOURS), workEnd + STRETCH_HOURS)) return 'stretched';
  return 'out';
}

function clipWindow(window: CityWindow, bound: CityWindow): CityWindow {
  return {
    id: window.id,
    startOffsetHours: Math.max(window.startOffsetHours, bound.startOffsetHours),
    endOffsetHours: Math.min(window.endOffsetHours, bound.endOffsetHours),
  };
}

const hasPositiveWidth = (window: CityWindow) => window.startOffsetHours < window.endOffsetHours;

// two-pass search, bounded to home's own stretched window: home must always
// end up at least 'stretched' (never 'out') at the chosen time, so every ring
// window is clipped to `homeBound` before sweeping — a ring whose own window
// doesn't intersect homeBound at all is simply excluded, exactly like it
// would classify as 'out' at any offset within homeBound anyway. Within that
// bound, try every included ring's strict working-hours window first; only
// if that can't cover every ring does a second pass, using each ring's window
// widened by STRETCH_HOURS on each side (still clipped to homeBound), get a
// chance to win instead (and only if it actually covers more rings than the
// strict pass did — see findMeetingTime-design.md's "Decisions locked"
// section). Treating home as a hard bound rather than just one more city in
// an unconstrained sweep prevents the search from picking a time that fits
// more rings while leaving the meeting's own home city outside its working
// hours entirely.
export function findBestMeetingOffset(now: Date, home: Location, includedRings: Location[]): FindMeetingTimeResult {
  const cities = [home, ...includedRings];
  const homeWindow = nextWorkingWindow(now, home);
  const homeBound = widenWindow(homeWindow, STRETCH_HOURS);

  // a ring's own next occurrence and the one following it (its next day's
  // cycle) are both checked against homeBound — home's window can be nearly
  // 36h away, so the ring's *immediate* next occurrence may fall on the
  // wrong day relative to home's, while its following one is the one that
  // actually overlaps.
  const ringCandidateWindows = (widenHours: number) =>
    includedRings.flatMap((ring) => {
      const occurrences = [nextWorkingWindow(now, ring), followingWorkingWindow(now, ring)];
      return occurrences
        .map((window) => clipWindow(widenHours > 0 ? widenWindow(window, widenHours) : window, homeBound))
        .filter(hasPositiveWidth);
    });

  let winner = sweepMaxOverlap([homeWindow, ...ringCandidateWindows(0)]);
  if (winner.count < cities.length) {
    const stretchedWinner = sweepMaxOverlap([homeBound, ...ringCandidateWindows(STRETCH_HOURS)]);
    if (stretchedWinner.count > winner.count) winner = stretchedWinner;
  }

  const snappedOffsetHours = snapForwardToQuarterHour(now, winner);
  const offsetMs = Math.round(snappedOffsetHours * MS_PER_HOUR);

  const cityResults = cities.map((city) => ({ id: city.id, status: classifyCity(now, offsetMs, city) }));
  const perfectCount = cityResults.filter((c) => c.status === 'in-hours').length;
  const fitCount = cityResults.filter((c) => c.status !== 'out').length;

  // `nextWorkingWindow` can only represent a city's NEXT strict working-hours
  // occurrence: if a city's strict hours ended a few minutes ago but it's
  // still inside its STRETCH_HOURS buffer right now, nextWorkingWindow skips
  // straight past that buffer to tomorrow's window, so the sweep above never
  // considers "now" as a candidate for that city at all. That can make the
  // swept winner fit fewer cities than simply staying at offset 0 would, even
  // though offset 0 is also always the earliest possible meeting time. So we
  // independently classify every city at offset 0 and prefer it whenever it
  // fits strictly more (or equally many but more perfectly) cities than the
  // swept winner — but only when home itself fits at offset 0 too, since
  // preferring "now" must not reintroduce a home-excluded result.
  const nowCityResults = cities.map((city) => ({ id: city.id, status: classifyCity(now, 0, city) }));
  const nowPerfectCount = nowCityResults.filter((c) => c.status === 'in-hours').length;
  const nowFitCount = nowCityResults.filter((c) => c.status !== 'out').length;
  const nowFitsHome = nowCityResults[0].status !== 'out';

  if (nowFitsHome && (nowFitCount > fitCount || (nowFitCount === fitCount && nowPerfectCount > perfectCount))) {
    return { offsetMs: 0, perfectCount: nowPerfectCount, fitCount: nowFitCount, totalCount: cities.length, cityResults: nowCityResults };
  }

  return { offsetMs, perfectCount, fitCount, totalCount: cities.length, cityResults };
}
