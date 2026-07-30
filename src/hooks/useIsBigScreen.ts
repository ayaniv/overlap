import { useEffect, useState } from 'react';

// reads window.screen (the physical display's resolution), not window.innerWidth/innerHeight
// (the browser viewport) — a maximized small window shouldn't count as "big", and a small or
// split browser window on a large external monitor/TV should still count. Checks the long edge
// via Math.max so a big screen counts regardless of its current rotation.
export const BIG_SCREEN_LONG_EDGE_PX = 1920;

function isBigScreenNow(): boolean {
  return Math.max(window.screen.width, window.screen.height) > BIG_SCREEN_LONG_EDGE_PX;
}

// this clock is meant to run unattended on a wall display (see useNow.ts, useIsIdle.ts) where
// the display, resolution, or rotation can change without the page reloading — window.screen has
// no native change event, but 'resize' fires on any viewport change (including a display's
// resolution or orientation changing), so re-derive from window.screen there, same live-update
// need useIsPortrait documents for orientation.
export function useIsBigScreen(): boolean {
  const [isBigScreen, setIsBigScreen] = useState(isBigScreenNow);

  useEffect(() => {
    const handleResize = () => setIsBigScreen(isBigScreenNow());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isBigScreen;
}
