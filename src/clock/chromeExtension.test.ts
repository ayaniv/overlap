import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHROME_WEB_STORE_URL, isChromeDesktop } from './chromeExtension';

const CHROME_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const EDGE_DESKTOP_UA = `${CHROME_DESKTOP_UA} Edg/126.0.0.0`;
const OPERA_DESKTOP_UA = `${CHROME_DESKTOP_UA} OPR/112.0.0.0`;
const VIVALDI_DESKTOP_UA = `${CHROME_DESKTOP_UA} Vivaldi/6.8.3381.48`;
const YANDEX_DESKTOP_UA = `${CHROME_DESKTOP_UA} YaBrowser/24.6.0.0`;
const FIREFOX_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0';
const SAFARI_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const CHROME_ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const SAMSUNG_INTERNET_UA = `${CHROME_DESKTOP_UA} SamsungBrowser/25.0`;
const CHROME_IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1';
// Electron shells (Slack, VS Code, Discord desktop) embed real Chromium and keep
// "Chrome/" in their UA, but have no Web Store to install into
const SLACK_ELECTRON_UA = `${CHROME_DESKTOP_UA} Slack/4.36.140 Electron/30.0.6`;

const GOOGLE_CHROME_BRANDS = [{ brand: 'Not A;Brand' }, { brand: 'Chromium' }, { brand: 'Google Chrome' }];
const EDGE_BRANDS = [{ brand: 'Not A;Brand' }, { brand: 'Chromium' }, { brand: 'Microsoft Edge' }];
const OPERA_BRANDS = [{ brand: 'Not A;Brand' }, { brand: 'Chromium' }, { brand: 'Opera' }];
const VIVALDI_BRANDS = [{ brand: 'Not A;Brand' }, { brand: 'Chromium' }, { brand: 'Vivaldi' }];
const ELECTRON_BRANDS = [{ brand: 'Not A;Brand' }, { brand: 'Chromium' }];

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

describe('isChromeDesktop', () => {
  it('is true for desktop Google Chrome reported through userAgentData brands', () => {
    stubNavigator({
      userAgent: CHROME_DESKTOP_UA,
      userAgentData: { brands: GOOGLE_CHROME_BRANDS, mobile: false },
    });
    expect(isChromeDesktop()).toBe(true);
  });

  it('is false when userAgentData reports mobile even for Google Chrome', () => {
    stubNavigator({
      userAgent: CHROME_ANDROID_UA,
      userAgentData: { brands: GOOGLE_CHROME_BRANDS, mobile: true },
    });
    expect(isChromeDesktop()).toBe(false);
  });

  it.each([
    ['Edge', EDGE_DESKTOP_UA, EDGE_BRANDS],
    ['Opera', OPERA_DESKTOP_UA, OPERA_BRANDS],
    ['Vivaldi', VIVALDI_DESKTOP_UA, VIVALDI_BRANDS],
    ['an Electron app', SLACK_ELECTRON_UA, ELECTRON_BRANDS],
    ['Firefox', FIREFOX_DESKTOP_UA, [{ brand: 'Something Else' }]],
  ])('is false for %s reported through userAgentData, which has a Chromium or other brand but no Google Chrome', (_name, userAgent, brands) => {
    stubNavigator({ userAgent, userAgentData: { brands, mobile: false } });
    expect(isChromeDesktop()).toBe(false);
  });

  it('is false for an Electron app even if its userAgentData claims a Google Chrome brand', () => {
    stubNavigator({
      userAgent: SLACK_ELECTRON_UA,
      userAgentData: { brands: GOOGLE_CHROME_BRANDS, mobile: false },
    });
    expect(isChromeDesktop()).toBe(false);
  });

  it('falls back to the user agent: Chrome desktop is true', () => {
    stubNavigator({ userAgent: CHROME_DESKTOP_UA });
    expect(isChromeDesktop()).toBe(true);
  });

  it.each([
    ['Edge desktop', EDGE_DESKTOP_UA],
    ['Opera desktop', OPERA_DESKTOP_UA],
    ['Vivaldi desktop', VIVALDI_DESKTOP_UA],
    ['Yandex Browser desktop', YANDEX_DESKTOP_UA],
    ['Samsung Internet', SAMSUNG_INTERNET_UA],
    ['an Electron-shell app', SLACK_ELECTRON_UA],
    ['Firefox desktop', FIREFOX_DESKTOP_UA],
    ['Safari desktop', SAFARI_DESKTOP_UA],
    ['Chrome on Android', CHROME_ANDROID_UA],
    ['Chrome on iOS', CHROME_IOS_UA],
  ])('falls back to the user agent: %s is false', (_name, userAgent) => {
    stubNavigator({ userAgent });
    expect(isChromeDesktop()).toBe(false);
  });

  it('is false for an iPad reporting a desktop Mac Chrome user agent', () => {
    stubNavigator({ userAgent: CHROME_DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 5 });
    expect(isChromeDesktop()).toBe(false);
  });

  // "Request desktop site" on a phone rewrites the user agent and userAgentData.mobile to
  // desktop values, so only the touch-first primary pointer still gives it away
  describe('when the primary pointer is coarse (a touch device)', () => {
    function stubPrimaryPointer(isCoarse: boolean) {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockImplementation((query: string) => ({ matches: query === '(pointer: coarse)' && isCoarse })),
      );
    }

    it('is false for a phone in "desktop site" mode, via userAgentData', () => {
      stubNavigator({
        userAgent: CHROME_DESKTOP_UA,
        platform: 'Linux armv81',
        userAgentData: { brands: GOOGLE_CHROME_BRANDS, mobile: false },
      });
      stubPrimaryPointer(true);
      expect(isChromeDesktop()).toBe(false);
    });

    it('is false for a phone in "desktop site" mode, via the user agent fallback', () => {
      stubNavigator({ userAgent: CHROME_DESKTOP_UA, platform: 'Linux armv81' });
      stubPrimaryPointer(true);
      expect(isChromeDesktop()).toBe(false);
    });

    it('stays true for the same browser with a fine primary pointer (mouse or trackpad)', () => {
      stubNavigator({ userAgent: CHROME_DESKTOP_UA });
      stubPrimaryPointer(false);
      expect(isChromeDesktop()).toBe(true);
    });
  });

  it('is false, not a throw, when navigator is unavailable (server rendering)', () => {
    vi.stubGlobal('navigator', undefined);
    expect(isChromeDesktop()).toBe(false);
  });
});
