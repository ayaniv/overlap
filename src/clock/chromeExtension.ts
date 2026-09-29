import { isMobileOS } from '../hooks/isMobileOS';

// canonical listing URL — deliberately without the authuser/hl query params a
// copied store link carries, which are per-viewer state, not part of the listing
export const CHROME_WEB_STORE_URL =
  'https://chromewebstore.google.com/detail/overlap-clock/mmocggabgpjljloaodecfblnohfgkbcj';

export const CHROME_EXTENSION_CTA_LABEL = 'Add to Chrome';
// appended (as its own visually-hidden text node, after an explicit space —
// see ChromeExtensionCta.tsx) after the visible label, so the accessible
// name contains the visible words verbatim (WCAG 2.5.3 Label in Name) while
// still naming the app for screen-reader users
export const CHROME_EXTENSION_CTA_HIDDEN_SUFFIX = 'for Overlap Clock';

// Edge and Opera keep "Chrome/" in their user agent, so one pattern covers every
// Chromium browser the fallback needs to recognise; Chrome on iOS ("CriOS") is
// WebKit underneath and can't install extensions, so it is intentionally absent.
// Electron shells (Slack, VS Code, Discord desktop) also keep "Chrome/" but have
// no Web Store, so they're excluded below.
const CHROMIUM_USER_AGENT_PATTERN = /Chrome\/|Edg\/|OPR\//;
const ELECTRON_USER_AGENT_PATTERN = /Electron\//;

// userAgentData isn't in lib.dom yet, hence the local shape
interface NavigatorWithUserAgentData {
  userAgentData?: { brands: { brand: string }[]; mobile: boolean };
}

// "Request desktop site" makes a phone's user agent and userAgentData look like a
// desktop, but its primary pointer stays a touchscreen; desktops and laptops
// (touchscreen or not) report a mouse/trackpad as primary
function hasCoarsePrimaryPointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

// desktop Chromium only: Chrome on Android/iOS shares the engine but can't
// install from the Web Store, so it gets no CTA
export function isChromiumDesktop(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (isMobileOS() || hasCoarsePrimaryPointer()) return false;
  // userAgentData is only exposed in secure (HTTPS) contexts, so it's absent
  // on an HTTP preview even in real desktop Chrome; those fall through to
  // the UA-string fallback below, which still detects them correctly
  const { userAgentData } = navigator as Navigator & NavigatorWithUserAgentData;
  if (userAgentData) {
    return !userAgentData.mobile && userAgentData.brands.some(({ brand }) => brand === 'Chromium');
  }
  if (ELECTRON_USER_AGENT_PATTERN.test(navigator.userAgent)) return false;
  return CHROMIUM_USER_AGENT_PATTERN.test(navigator.userAgent);
}
