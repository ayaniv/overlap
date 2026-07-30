import { useEffect, useState } from 'react';
import { useIsPortrait } from './useIsPortrait';

const TOUCH_PRIMARY_QUERY = '(pointer: coarse)';

// true when the primary pointing input is touch (phones, tablets) — false for a mouse/trackpad
// (most desktops and kiosk PCs), a remote-control-only device, or no pointing input at all
// ('pointer: none' doesn't match 'coarse', so it correctly falls through to "not touch-primary")
function useIsTouchPrimary(): boolean {
  const [isTouchPrimary, setIsTouchPrimary] = useState(() => window.matchMedia(TOUCH_PRIMARY_QUERY).matches);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(TOUCH_PRIMARY_QUERY);
    setIsTouchPrimary(mediaQueryList.matches);
    const handleChange = (event: MediaQueryListEvent) => setIsTouchPrimary(event.matches);
    mediaQueryList.addEventListener('change', handleChange);
    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, []);

  return isTouchPrimary;
}

// an unattended wall-mounted kiosk display, rotated to portrait. These get installed on
// arbitrary client hardware, so there's no physical resolution we can assume up front — a
// window.screen size threshold would collide with tablets, which span roughly the same
// resolution range as small/older kiosk displays. Input type is a more reliable signal
// regardless of resolution: a phone or tablet held in portrait is touch-primary; a kiosk PC
// driving a rotated monitor/TV is driven by a mouse, a remote, or nothing at all.
export function useIsKioskDisplay(): boolean {
  const isPortrait = useIsPortrait();
  const isTouchPrimary = useIsTouchPrimary();
  return isPortrait && !isTouchPrimary;
}
