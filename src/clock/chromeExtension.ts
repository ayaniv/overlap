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

// userAgentData isn't in lib.dom yet, hence the local shape
interface NavigatorWithUserAgentData {
  userAgentData?: { mobile: boolean };
}

// "Request desktop site" makes a phone's user agent and userAgentData look like a
// desktop, but its primary pointer stays a touchscreen; desktops and laptops
// (touchscreen or not) report a mouse/trackpad as primary
function hasCoarsePrimaryPointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

// desktop only: the CTA links to the Chrome Web Store, which itself tells a visitor on
// another desktop browser to switch to Chrome, so the browser isn't checked. Phones and
// tablets can't install from the Web Store, so they don't get the button.
export function isDesktop(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (isMobileOS() || hasCoarsePrimaryPointer()) return false;
  // userAgentData is only exposed in secure (HTTPS) contexts, so on an HTTP preview
  // the user-agent check in isMobileOS() above is the only mobile signal available
  const { userAgentData } = navigator as Navigator & NavigatorWithUserAgentData;
  return !userAgentData?.mobile;
}
