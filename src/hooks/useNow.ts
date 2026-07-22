import { useEffect, useState } from 'react';

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // a plain setInterval(fn, intervalMs) here would start counting from whenever this
    // effect happened to run, not from a real wall-clock boundary — so `now` (and every
    // label/arc/dot derived from it) would update up to `intervalMs` out of phase with real
    // time. The sweep hand (useSweepAngle) reads Date.now() directly every animation frame
    // and always crosses the topmost point exactly on the real second; without this
    // alignment, `now`'s once-a-second update lands at an arbitrary, unrelated phase, so
    // anything driven by it visibly lags/leads the moment the hand actually reaches the top.
    // Align the first tick to the next real boundary, then keep the plain interval running
    // from there — worst case, an interval callback firing a few ms late from event-loop
    // congestion, not a whole `intervalMs` of avoidable phase error.
    const msUntilNextBoundary = intervalMs - (Date.now() % intervalMs);
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const timeoutId = setTimeout(() => {
      setNow(new Date());
      intervalId = setInterval(() => setNow(new Date()), intervalMs);
    }, msUntilNextBoundary);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId !== undefined) clearInterval(intervalId);
    };
  }, [intervalMs]);

  return now;
}
