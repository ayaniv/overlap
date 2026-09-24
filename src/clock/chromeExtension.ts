import { isMobileOS } from '../hooks/isMobileOS';

// canonical listing URL — deliberately without the authuser/hl query params a
// copied store link carries, which are per-viewer state, not part of the listing
export const CHROME_WEB_STORE_URL =
  'https://chromewebstore.google.com/detail/overlap-clock/mmocggabgpjljloaodecfblnohfgkbcj';

export const CHROME_EXTENSION_CTA_LABEL = 'Add to Chrome';
export const CHROME_EXTENSION_CTA_ARIA_LABEL = 'Add Overlap Clock to Chrome';
export const CHROME_EXTENSION_SECONDARY_LABEL = 'Also available as a Chrome extension';

// Edge and Opera keep "Chrome/" in their user agent, so one pattern covers every
// Chromium browser the fallback needs to recognise; Chrome on iOS ("CriOS") is
// WebKit underneath and can't install extensions, so it is intentionally absent
const CHROMIUM_USER_AGENT_PATTERN = /Chrome\/|Edg\/|OPR\//;

// userAgentData isn't in lib.dom yet, hence the local shape
interface NavigatorWithUserAgentData {
  userAgentData?: { brands: { brand: string }[]; mobile: boolean };
}

// desktop Chromium only: Chrome on Android/iOS shares the engine but can't
// install from the Web Store, so it must get the "also available" fallback
export function isChromiumDesktop(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (isMobileOS()) return false;
  const { userAgentData } = navigator as Navigator & NavigatorWithUserAgentData;
  if (userAgentData) {
    return !userAgentData.mobile && userAgentData.brands.some(({ brand }) => brand === 'Chromium');
  }
  return CHROMIUM_USER_AGENT_PATTERN.test(navigator.userAgent);
}
