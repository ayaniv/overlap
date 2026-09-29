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

function renderCta() {
  return render(withAnalytics(<ChromeExtensionCta />));
}

describe('ChromeExtensionCta on Chromium desktop', () => {
  beforeEach(() => stubUserAgent(CHROME_DESKTOP_UA));

  it('renders an Add to Chrome link to the exact store URL, in a new tab', () => {
    renderCta();

    const link = screen.getByTestId('chrome-extension-cta');
    expect(link.getAttribute('href')).toBe(CHROME_WEB_STORE_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  // WCAG 2.5.3 (Label in Name): the accessible name must contain the visible
  // label text verbatim, so a speech-control user saying "click Add to
  // Chrome" can activate it — checked via the real accessible-name
  // computation (getByRole's name matcher), not a raw aria-label assertion
  it('has an accessible name that starts with the visible "Add to Chrome" label', () => {
    renderCta();

    expect(screen.getByRole('link', { name: 'Add to Chrome for Overlap Clock' })).toBeTruthy();
  });

  it('shows the Chrome logo inside the link, hidden from assistive tech since the link already has a name', () => {
    renderCta();

    const logo = screen.getByTestId('chrome-extension-cta-logo');
    expect(screen.getByTestId('chrome-extension-cta').contains(logo)).toBe(true);
    expect(logo.getAttribute('aria-hidden')).toBe('true');
  });

  it('emits chrome_extension_cta_clicked with the header placement through the analytics abstraction', async () => {
    const user = userEvent.setup();
    renderCta();

    await user.click(screen.getByTestId('chrome-extension-cta'));

    expect(analytics.trackEvent).toHaveBeenCalledTimes(1);
    expect(analytics.trackEvent).toHaveBeenCalledWith('chrome_extension_cta_clicked', { placement: 'header' });
  });
});

describe('ChromeExtensionCta on a browser that cannot install Chrome extensions', () => {
  beforeEach(() => stubUserAgent(FIREFOX_DESKTOP_UA));

  it('renders nothing, leaving the web-app path untouched', () => {
    const { container } = renderCta();

    expect(container.innerHTML).toBe('');
  });
});

describe('ChromeExtensionCta server rendering', () => {
  it('renders identical (empty) markup on the server regardless of browser, so nothing can mismatch on hydration', () => {
    stubUserAgent(CHROME_DESKTOP_UA);
    const chromeMarkup = renderToString(withAnalytics(<ChromeExtensionCta />));
    stubUserAgent(FIREFOX_DESKTOP_UA);
    const firefoxMarkup = renderToString(withAnalytics(<ChromeExtensionCta />));

    expect(chromeMarkup).toBe('');
    expect(firefoxMarkup).toBe(chromeMarkup);
  });
});
