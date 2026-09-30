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

// Other Chromium browsers (Edge, Opera, Vivaldi, Samsung Internet, Yandex) and
// Electron shells (Slack, VS Code, Discord desktop) all keep "Chrome/" in their
// user agent, so the fallback needs their own tokens to tell them apart from real
// Chrome. Chrome on iOS ("CriOS") is WebKit underneath and never matches "Chrome/".
// Brave and other privacy browsers deliberately present as Chrome; that's
// indistinguishable from here and acceptable, so it isn't chased.
const CHROME_USER_AGENT_PATTERN = /Chrome\//;
const NON_CHROME_USER_AGENT_PATTERN = /Edg\/|EdgA\/|OPR\/|Vivaldi\/|SamsungBrowser\/|Electron\/|YaBrowser\//;
const GOOGLE_CHROME_BRAND = 'Google Chrome';

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

// desktop Google Chrome only: the CTA links to the Chrome Web Store and is labelled
// "Add to Chrome", so other Chromium browsers don't get it, and Chrome on
// Android/iOS can't install from the Web Store either
export function isChromeDesktop(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (isMobileOS() || hasCoarsePrimaryPointer()) return false;
  // checked on both paths: an embedder that exposes userAgentData still keeps
  // its own token in the user agent
  if (NON_CHROME_USER_AGENT_PATTERN.test(navigator.userAgent)) return false;
  // userAgentData is only exposed in secure (HTTPS) contexts, so it's absent
  // on an HTTP preview even in real desktop Chrome; those fall through to
  // the UA-string fallback below, which still detects them correctly
  const { userAgentData } = navigator as Navigator & NavigatorWithUserAgentData;
  if (userAgentData) {
    return !userAgentData.mobile && userAgentData.brands.some(({ brand }) => brand === GOOGLE_CHROME_BRAND);
  }
  return CHROME_USER_AGENT_PATTERN.test(navigator.userAgent);
}
