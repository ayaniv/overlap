import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsProvider } from '../analytics/AnalyticsProvider';
import { createMockAnalyticsService } from '../analytics/mockAnalyticsService';
import type { MockAnalyticsService } from '../analytics/mockAnalyticsService';
import { CHROME_WEB_STORE_URL } from './chromeExtension';
import { ChromeExtensionCta } from './ChromeExtensionCta';
import type { ChromeExtensionCtaPlacement } from './ChromeExtensionCta';

const CHROME_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FIREFOX_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0';

let analytics: MockAnalyticsService;

beforeEach(() => {
  analytics = createMockAnalyticsService();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubUserAgent(userAgent: string) {
  vi.stubGlobal('navigator', { userAgent, platform: 'MacIntel', maxTouchPoints: 0 });
}

function withAnalytics(children: ReactNode) {
  return <AnalyticsProvider service={analytics}>{children}</AnalyticsProvider>;
}

function renderCta(placement: ChromeExtensionCtaPlacement) {
  return render(withAnalytics(<ChromeExtensionCta placement={placement} />));
}

describe('ChromeExtensionCta on Chromium desktop', () => {
  beforeEach(() => stubUserAgent(CHROME_DESKTOP_UA));

  it.each(['hero', 'header'] as const)('%s renders an Add to Chrome link to the exact store URL, in a new tab', (placement) => {
    renderCta(placement);

    const link = screen.getByTestId(`chrome-extension-cta-${placement}`);
    expect(link.getAttribute('href')).toBe(CHROME_WEB_STORE_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('aria-label')).toBe('Add Overlap Clock to Chrome');
  });

  it('emits chrome_extension_cta_clicked with the placement through the analytics abstraction', async () => {
    const user = userEvent.setup();
    renderCta('hero');

    await user.click(screen.getByTestId('chrome-extension-cta-hero'));

    expect(analytics.trackEvent).toHaveBeenCalledTimes(1);
    expect(analytics.trackEvent).toHaveBeenCalledWith('chrome_extension_cta_clicked', { placement: 'hero' });
  });
});

describe('ChromeExtensionCta on a browser that cannot install Chrome extensions', () => {
  beforeEach(() => stubUserAgent(FIREFOX_DESKTOP_UA));

  it('hero shows the quiet secondary text link to the same store URL, not the primary CTA', () => {
    renderCta('hero');

    expect(screen.queryByTestId('chrome-extension-cta-hero')).toBeNull();
    const link = screen.getByTestId('chrome-extension-secondary-link');
    expect(link.getAttribute('href')).toBe(CHROME_WEB_STORE_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('header renders nothing', () => {
    const { container } = renderCta('header');

    expect(container.innerHTML).toBe('');
  });

  it('still emits the analytics event when the secondary link is clicked', async () => {
    const user = userEvent.setup();
    renderCta('hero');

    await user.click(screen.getByTestId('chrome-extension-secondary-link'));

    expect(analytics.trackEvent).toHaveBeenCalledWith('chrome_extension_cta_clicked', { placement: 'hero' });
  });
});

describe('ChromeExtensionCta server rendering', () => {
  it('renders identical (empty) markup on the server regardless of browser, so nothing can mismatch on hydration', () => {
    stubUserAgent(CHROME_DESKTOP_UA);
    const chromeMarkup = renderToString(withAnalytics(<ChromeExtensionCta placement="hero" />));
    stubUserAgent(FIREFOX_DESKTOP_UA);
    const firefoxMarkup = renderToString(withAnalytics(<ChromeExtensionCta placement="hero" />));

    expect(chromeMarkup).toBe('');
    expect(firefoxMarkup).toBe(chromeMarkup);
  });
});
