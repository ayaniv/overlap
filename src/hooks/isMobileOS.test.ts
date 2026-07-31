import { afterEach, describe, expect, it } from 'vitest';
import { isMobileOS } from './isMobileOS';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

function stubNavigator({ userAgent = DESKTOP_UA, platform = 'MacIntel', maxTouchPoints = 0 } = {}) {
  Object.defineProperty(window.navigator, 'userAgent', { value: userAgent, configurable: true });
  Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

afterEach(() => {
  stubNavigator();
});

describe('isMobileOS', () => {
  it('is true on an iPhone user agent', () => {
    stubNavigator({ userAgent: IPHONE_UA });
    expect(isMobileOS()).toBe(true);
  });

  it('is true on an Android user agent', () => {
    stubNavigator({ userAgent: ANDROID_UA });
    expect(isMobileOS()).toBe(true);
  });

  it('is false on a plain desktop Mac user agent with no multi-touch', () => {
    stubNavigator({ userAgent: DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 0 });
    expect(isMobileOS()).toBe(false);
  });

  it('is true on an iPad masquerading as a Mac (iPadOS 13+ desktop-site UA) via the multi-touch fallback', () => {
    stubNavigator({ userAgent: DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 5 });
    expect(isMobileOS()).toBe(true);
  });

  it('is false on Windows desktop', () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', platform: 'Win32', maxTouchPoints: 0 });
    expect(isMobileOS()).toBe(false);
  });
});
