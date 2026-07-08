import { useEffect, useState } from 'react';

const PORTRAIT_QUERY = '(orientation: portrait)';

// mirrors the portrait/mobile breakpoint the CSS already keys off of (WorldClock.module.css,
// ControlCluster.module.css), but kept live — unlike useSweepAngle's one-off matchMedia read
// (reduced-motion never changes mid-session), orientation can change at runtime, so callers
// need a `change` listener, not just the value at mount.
export function useIsPortrait(): boolean {
  const [isPortrait, setIsPortrait] = useState(() => window.matchMedia(PORTRAIT_QUERY).matches);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(PORTRAIT_QUERY);
    setIsPortrait(mediaQueryList.matches);
    const handleChange = (event: MediaQueryListEvent) => setIsPortrait(event.matches);
    mediaQueryList.addEventListener('change', handleChange);
    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, []);

  return isPortrait;
}
