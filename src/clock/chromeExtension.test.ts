import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHROME_WEB_STORE_URL, isDesktop } from './chromeExtension';

const CHROME_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const EDGE_DESKTOP_UA = `${CHROME_DESKTOP_UA} Edg/126.0.0.0`;
const FIREFOX_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0';
const SAFARI_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const CHROME_ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const DESKTOP_BRANDS = [{ brand: 'Not A;Brand' }, { brand: 'Chromium' }, { brand: 'Microsoft Edge' }];

interface FakeNavigator {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { brands: { brand: string }[]; mobile: boolean };
}

function stubNavigator(fake: FakeNavigator) {
  vi.stubGlobal('navigator', { platform: 'MacIntel', maxTouchPoints: 0, ...fake });
}

function stubPrimaryPointer(isCoarse: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({ matches: query === '(pointer: coarse)' && isCoarse })),
  );
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

describe('isDesktop', () => {
  it.each([
    ['Chrome', CHROME_DESKTOP_UA],
    ['Edge', EDGE_DESKTOP_UA],
    ['Firefox', FIREFOX_DESKTOP_UA],
    ['Safari', SAFARI_DESKTOP_UA],
  ])('is true for desktop %s without userAgentData', (_name, userAgent) => {
    stubNavigator({ userAgent });
    expect(isDesktop()).toBe(true);
  });

  it('is true for a desktop browser whose userAgentData reports mobile: false', () => {
    stubNavigator({ userAgent: EDGE_DESKTOP_UA, userAgentData: { brands: DESKTOP_BRANDS, mobile: false } });
    expect(isDesktop()).toBe(true);
  });

  it('is false when userAgentData reports mobile', () => {
    stubNavigator({ userAgent: CHROME_ANDROID_UA, userAgentData: { brands: DESKTOP_BRANDS, mobile: true } });
    expect(isDesktop()).toBe(false);
  });

  it.each([
    ['an iPhone', IPHONE_UA],
    ['an iPad', IPAD_UA],
    ['an Android phone', CHROME_ANDROID_UA],
  ])('is false for %s user agent when userAgentData is absent', (_name, userAgent) => {
    stubNavigator({ userAgent });
    expect(isDesktop()).toBe(false);
  });

  it('is false for an iPad reporting a desktop Mac user agent', () => {
    stubNavigator({ userAgent: SAFARI_DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 5 });
    expect(isDesktop()).toBe(false);
  });

  // "Request desktop site" on a phone rewrites the user agent and userAgentData.mobile to
  // desktop values, so only the touch-first primary pointer still gives it away
  describe('when the primary pointer is coarse (a touch device)', () => {
    it('is false with a desktop user agent and no userAgentData', () => {
      stubNavigator({ userAgent: CHROME_DESKTOP_UA, platform: 'Linux armv81' });
      stubPrimaryPointer(true);
      expect(isDesktop()).toBe(false);
    });

    it('is false with a desktop user agent and userAgentData.mobile false', () => {
      stubNavigator({
        userAgent: CHROME_DESKTOP_UA,
        platform: 'Linux armv81',
        userAgentData: { brands: DESKTOP_BRANDS, mobile: false },
      });
      stubPrimaryPointer(true);
      expect(isDesktop()).toBe(false);
    });
  });

  it('stays true on a touchscreen laptop, whose primary pointer is still fine (mouse or trackpad)', () => {
    stubNavigator({ userAgent: CHROME_DESKTOP_UA, maxTouchPoints: 1 });
    stubPrimaryPointer(false);
    expect(isDesktop()).toBe(true);
  });

  it('is true, not a throw, when matchMedia is unavailable', () => {
    stubNavigator({ userAgent: SAFARI_DESKTOP_UA });
    vi.stubGlobal('matchMedia', undefined);
    expect(isDesktop()).toBe(true);
  });

  it('is false, not a throw, when navigator is unavailable (server rendering)', () => {
    vi.stubGlobal('navigator', undefined);
    expect(isDesktop()).toBe(false);
  });
});
