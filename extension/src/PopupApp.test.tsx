import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsProvider } from '../../src/analytics/AnalyticsProvider';
import { createMockAnalyticsService } from '../../src/analytics/mockAnalyticsService';
import { LoggerProvider } from '../../src/logger/LoggerProvider';
import { createMockLoggerService } from '../../src/logger/mockLoggerService';
import { encodeConfig } from '../../src/clock/shareCodec';
import { WEB_APP_ORIGIN, WEB_APP_PRIVACY_URL, buildWebAppUrl } from '../../src/clock/webAppUrl';
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from '../../src/hooks/useClockConfig';
import type { ClockConfig } from '../../src/clock/types';
import { PopupApp } from './PopupApp';

// The popup window is 380x600 (see extension/src/popup.css), which is
// portrait — the same branch the web app already ships for phones, so
// MobileConfigView (not the desktop ConfigPanel) is the config surface here.
// jsdom implements neither matchMedia nor a real viewport, so pin it.
function stubPortraitMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(orientation: portrait)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

type ChromeTabsStub = { tabs: { create: ReturnType<typeof vi.fn> } };

function stubChrome(create = vi.fn().mockResolvedValue({ id: 1 })): ChromeTabsStub {
  const chromeStub: ChromeTabsStub = { tabs: { create } };
  vi.stubGlobal('chrome', chromeStub);
  return chromeStub;
}

// jsdom implements neither navigator.share nor navigator.clipboard; stubbing
// clipboard only (no .share) forces the deterministic "copied" fallback path
// through shareLink, and hands the test the spy it needs to assert *which*
// href was copied.
function stubClipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  return writeText;
}

function seedStoredConfig(config: ClockConfig) {
  window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

function renderPopup() {
  const analytics = createMockAnalyticsService();
  const logger = createMockLoggerService();
  const { unmount } = render(
    <AnalyticsProvider service={analytics}>
      <LoggerProvider service={logger}>
        <PopupApp />
      </LoggerProvider>
    </AnalyticsProvider>,
  );
  return { analytics, logger, unmount };
}

// ControlCluster starts collapsed behind its hamburger toggle; fireEvent (not
// userEvent) throughout the share cases so userEvent.setup()'s own clipboard
// stub never displaces the spy installed by stubClipboard.
function openClusterMenu() {
  fireEvent.click(screen.getByTestId('control-menu-toggle'));
}

beforeEach(() => {
  stubPortraitMatchMedia();
  stubChrome();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PopupApp — the clock itself', () => {
  it('renders the built-in default config on a first open, with no stored config', () => {
    renderPopup();

    expect(screen.getByTestId('center-local-label').textContent).toBe(DEFAULT_CONFIG.home.label.toUpperCase());
    for (const ring of DEFAULT_CONFIG.rings) {
      expect(screen.getByTestId(`ring-label-${ring.id}`)).toBeTruthy();
    }
  });

  it('renders a previously stored config instead of the defaults', () => {
    seedStoredConfig({
      home: { id: 'berlin', label: 'Berlin', timezoneId: 'Europe/Berlin', color: '#38BDF8', workStart: 9, workEnd: 18 },
      rings: [{ id: 'tokyo', label: 'Tokyo', timezoneId: 'Asia/Tokyo', color: '#FB7185', workStart: 9, workEnd: 18 }],
      meetings: [],
    });

    renderPopup();

    expect(screen.getByTestId('center-local-label').textContent).toBe('BERLIN');
    expect(screen.getByTestId('ring-label-tokyo')).toBeTruthy();
    expect(screen.queryByTestId('ring-label-sydney')).toBeNull();
  });

  it('persists a removed city so the next popup open no longer shows it', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPopup();

    await user.click(screen.getByTestId('control-menu-toggle'));
    await user.click(screen.getByTestId('control-config-button'));
    await user.click(screen.getByTestId('remove-location-london'));
    unmount();

    // a fresh mount is exactly what re-opening the popup does — the popup page
    // is torn down every time it loses focus, so persistence is the whole
    // mechanism keeping a config alive between opens
    renderPopup();
    expect(screen.queryByTestId('ring-label-london')).toBeNull();
    expect(screen.getByTestId('ring-label-new-york')).toBeTruthy();
  });
});

describe('PopupApp — no Chrome extension CTA inside the extension itself', () => {
  it('renders neither the Add to Chrome CTAs nor the secondary link', () => {
    renderPopup();

    expect(screen.queryByTestId('chrome-extension-cta-hero')).toBeNull();
    expect(screen.queryByTestId('chrome-extension-cta-header')).toBeNull();
    expect(screen.queryByTestId('chrome-extension-secondary-link')).toBeNull();
  });
});

describe('PopupApp — sharing links to the web app, never to chrome-extension://', () => {
  it('copies an overlapclock.com link carrying the current config', async () => {
    const config: ClockConfig = { ...DEFAULT_CONFIG, rings: DEFAULT_CONFIG.rings.slice(0, 2) };
    seedStoredConfig(config);
    const writeText = stubClipboard();
    const { analytics } = renderPopup();

    openClusterMenu();
    fireEvent.click(screen.getByTestId('control-share-button'));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toBe(`${WEB_APP_ORIGIN}/#c=${encodeConfig(config)}`);
    expect(copied.startsWith('chrome-extension://')).toBe(false);
    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('clock_shared', { outcome: 'copied' }));
    expect(await screen.findByTestId('toast-message')).toBeTruthy();
  });

  it('surfaces a failed clipboard write as a toast and a failed-outcome event', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('clipboard blocked')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { analytics } = renderPopup();

    openClusterMenu();
    fireEvent.click(screen.getByTestId('control-share-button'));

    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('clock_shared', { outcome: 'failed' }));
    expect((await screen.findByTestId('toast-message')).textContent).toBeTruthy();
  });
});

describe('PopupApp — handing off to the full web app', () => {
  it('opens a tab at the web-app URL carrying the current config, and tracks it', async () => {
    const config: ClockConfig = { ...DEFAULT_CONFIG, rings: DEFAULT_CONFIG.rings.slice(0, 1) };
    seedStoredConfig(config);
    const chromeStub = stubChrome();
    const user = userEvent.setup();
    const { analytics } = renderPopup();

    await user.click(screen.getByTestId('open-in-web-app'));

    await waitFor(() => expect(chromeStub.tabs.create).toHaveBeenCalledWith({ url: buildWebAppUrl(config) }));
    expect(analytics.trackEvent).toHaveBeenCalledWith('extension_open_web_app_clicked');
  });

  it('logs through the logger service when opening the tab rejects', async () => {
    stubChrome(vi.fn().mockRejectedValue(new Error('no tabs permission')));
    const user = userEvent.setup();
    const { logger } = renderPopup();

    await user.click(screen.getByTestId('open-in-web-app'));

    await waitFor(() => expect(logger.error).toHaveBeenCalledTimes(1));
    expect(logger.error.mock.calls[0][1]).toEqual(expect.any(String));
  });

  it('points the privacy link at the hosted policy, not a relative path that 404s in the extension', () => {
    renderPopup();

    const privacyLink = screen.getByTestId('privacy-link') as HTMLAnchorElement;
    expect(privacyLink.getAttribute('href')).toBe(WEB_APP_PRIVACY_URL);
  });

  // without target="_blank" the link would navigate the popup's own 380x600
  // frame away from the extension instead of opening a new tab, losing the
  // mounted clock until the popup is reopened
  it('opens the privacy link in a new tab, not the popup itself', () => {
    renderPopup();

    const privacyLink = screen.getByTestId('privacy-link') as HTMLAnchorElement;
    expect(privacyLink.target).toBe('_blank');
    expect(privacyLink.rel).toBe('noreferrer');
  });
});

describe('PopupApp — features deliberately left to the web app', () => {
  // Google Identity Services is loaded as a remote <script>, which MV3's
  // `script-src 'self'` blocks outright — so the popup must not offer any
  // surface that would reach for it. Scrubbing is the entry point to
  // quick-schedule, so the popup ships without it.
  it('renders no scrub slider and no scheduling controls', () => {
    renderPopup();

    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByTestId('control-scrub-schedule-button')).toBeNull();
    expect(screen.queryByTestId('control-remove-meeting-button')).toBeNull();
  });

  it('renders no Find overlap button', () => {
    renderPopup();

    expect(screen.queryByTestId('control-find-time-button')).toBeNull();
  });
});
