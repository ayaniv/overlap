import { useEffect, useState } from 'react';

// reads window.screen (the physical display's resolution), not window.innerWidth/innerHeight
// (the browser viewport) — a maximized small window shouldn't count as "big", and a small or
// split browser window on a large external monitor/TV should still count.
export const BIG_SCREEN_LONG_EDGE_PX = 1920;

// big AND vertical, not big alone — a wide desktop monitor at any size is a normal desk setup
// and should still show the hint; a big screen rotated to portrait is the actual "wall kiosk"
// signal, since nobody works at a desk in portrait. Reads window.screen.height/width directly
// (rather than useIsPortrait's matchMedia viewport query) so this stays one coherent
// window.screen-based signal instead of mixing two different sources.
function isBigVerticalScreenNow(): boolean {
  const { width, height } = window.screen;
  return height > width && height >= BIG_SCREEN_LONG_EDGE_PX;
}

// this clock is meant to run unattended on a wall display (see useNow.ts, useIsIdle.ts) where
// the display, resolution, or rotation can change without the page reloading — window.screen has
// no native change event, but 'resize' fires on any viewport change (including a display's
// resolution or orientation changing), so re-derive from window.screen there, same live-update
// need useIsPortrait documents for orientation.
export function useIsBigVerticalScreen(): boolean {
  const [isBigVerticalScreen, setIsBigVerticalScreen] = useState(isBigVerticalScreenNow);

  useEffect(() => {
    const handleResize = () => setIsBigVerticalScreen(isBigVerticalScreenNow());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isBigVerticalScreen;
}
