import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHROME_WEB_STORE_URL, isChromiumDesktop } from './chromeExtension';

const CHROME_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const EDGE_DESKTOP_UA = `${CHROME_DESKTOP_UA} Edg/126.0.0.0`;
const OPERA_DESKTOP_UA = `${CHROME_DESKTOP_UA} OPR/112.0.0.0`;
const FIREFOX_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0';
const SAFARI_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const CHROME_ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const CHROME_IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1';

interface FakeNavigator {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { brands: { brand: string }[]; mobile: boolean };
}

function stubNavigator(fake: FakeNavigator) {
  vi.stubGlobal('navigator', { platform: 'MacIntel', maxTouchPoints: 0, ...fake });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CHROME_WEB_STORE_URL', () => {
  it('is the canonical listing URL with no authuser/hl tracking params', () => {
    expect(CHROME_WEB_STORE_URL).toBe(
      'https://chromewebstore.google.com/detail/overlap-clock/mmocggabgpjljloaodecfblnohfgkbcj',
    );
    expect(CHROME_WEB_STORE_URL).not.toMatch(/[?&](authuser|hl)=/);
  });
});

describe('isChromiumDesktop', () => {
  it('is true for desktop Chromium reported through userAgentData brands', () => {
    stubNavigator({
      userAgent: CHROME_DESKTOP_UA,
      userAgentData: { brands: [{ brand: 'Not A;Brand' }, { brand: 'Chromium' }, { brand: 'Google Chrome' }], mobile: false },
    });
    expect(isChromiumDesktop()).toBe(true);
  });

  it('is false when userAgentData reports mobile even for Chromium', () => {
    stubNavigator({
      userAgent: CHROME_ANDROID_UA,
      userAgentData: { brands: [{ brand: 'Chromium' }], mobile: true },
    });
    expect(isChromiumDesktop()).toBe(false);
  });

  it('is false when userAgentData lists no Chromium brand', () => {
    stubNavigator({
      userAgent: FIREFOX_DESKTOP_UA,
      userAgentData: { brands: [{ brand: 'Something Else' }], mobile: false },
    });
    expect(isChromiumDesktop()).toBe(false);
  });

  it.each([
    ['Chrome', CHROME_DESKTOP_UA],
    ['Edge', EDGE_DESKTOP_UA],
    ['Opera', OPERA_DESKTOP_UA],
  ])('falls back to the user agent: %s desktop is true', (_name, userAgent) => {
    stubNavigator({ userAgent });
    expect(isChromiumDesktop()).toBe(true);
  });

  it.each([
    ['Firefox desktop', FIREFOX_DESKTOP_UA],
    ['Safari desktop', SAFARI_DESKTOP_UA],
    ['Chrome on Android', CHROME_ANDROID_UA],
    ['Chrome on iOS', CHROME_IOS_UA],
  ])('falls back to the user agent: %s is false', (_name, userAgent) => {
    stubNavigator({ userAgent });
    expect(isChromiumDesktop()).toBe(false);
  });

  it('is false for an iPad reporting a desktop Mac Chrome user agent', () => {
    stubNavigator({ userAgent: CHROME_DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 5 });
    expect(isChromiumDesktop()).toBe(false);
  });

  it('is false, not a throw, when navigator is unavailable (server rendering)', () => {
    vi.stubGlobal('navigator', undefined);
    expect(isChromiumDesktop()).toBe(false);
  });
});
