import { useEffect, useState } from 'react';

export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // every value derived from `now` (city/home labels, working-hours arcs, meeting
    // dots) only ever renders at minute precision — no seconds shown anywhere — and a
    // minute is a fixed, universal duration, so there's nothing to gain from waking up
    // more often than once a minute. Re-deriving "ms until the next real boundary" from
    // Date.now() on every fire, instead of a single setInterval left running, self-corrects
    // any drift each cycle rather than accumulating it — worth doing at a 60s cadence
    // (unlike the old 1s one) since this clock is meant to sit on a wall running
    // unattended for a long stretch, and a plain interval never re-syncs to real time once
    // it's running.
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const msUntilNextBoundary = intervalMs - (Date.now() % intervalMs);
      timeoutId = setTimeout(() => {
        setNow(new Date());
        scheduleNext();
      }, msUntilNextBoundary);
    };
    scheduleNext();

    return () => clearTimeout(timeoutId);
  }, [intervalMs]);

  return now;
}
