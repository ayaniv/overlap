import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsProvider } from '../analytics/AnalyticsProvider';
import { createMockAnalyticsService } from '../analytics/mockAnalyticsService';
import { encodeConfig } from '../clock/shareCodec';
import type { ClockConfig } from '../clock/types';
import { DEFAULT_CONFIG, parseHashConfig, parseStoredConfig, resolveInitialConfig, useClockConfig } from './useClockConfig';

const SAMPLE_CONFIG: ClockConfig = {
  home: { id: 'tel-aviv', label: 'Tel Aviv', timezoneId: 'Asia/Jerusalem', color: '#38BDF8', workStart: 9, workEnd: 18 },
  rings: [{ id: 'san-francisco', label: 'San Francisco', timezoneId: 'America/Los_Angeles', color: '#FB7185', workStart: 9, workEnd: 18 }],
  meetings: [],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseHashConfig', () => {
  it('decodes a `#c=` hash into a config', () => {
    const hash = `#c=${encodeConfig(SAMPLE_CONFIG)}`;
    expect(parseHashConfig(hash)).toEqual(SAMPLE_CONFIG);
  });

  it('returns null for a hash without the c= payload', () => {
    expect(parseHashConfig('#')).toBeNull();
    expect(parseHashConfig('')).toBeNull();
    expect(parseHashConfig('#other=value')).toBeNull();
  });

  it('returns null for an empty payload', () => {
    expect(parseHashConfig('#c=')).toBeNull();
  });
});

describe('parseStoredConfig', () => {
  it('parses a valid JSON string', () => {
    expect(parseStoredConfig(JSON.stringify(SAMPLE_CONFIG))).toEqual(SAMPLE_CONFIG);
  });

  it('returns null for null input', () => {
    expect(parseStoredConfig(null)).toBeNull();
  });

  it('returns null and logs an error for corrupt JSON', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseStoredConfig('{not valid json')).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('returns null and logs an error for valid JSON with the wrong shape', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseStoredConfig(JSON.stringify({ foo: 'bar' }))).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('resolveInitialConfig', () => {
  it('prefers the URL hash over localStorage', () => {
    const otherConfig: ClockConfig = { ...SAMPLE_CONFIG, home: { ...SAMPLE_CONFIG.home, label: 'Other' } };
    const hash = `#c=${encodeConfig(SAMPLE_CONFIG)}`;
    expect(resolveInitialConfig(hash, JSON.stringify(otherConfig))).toEqual(SAMPLE_CONFIG);
  });

  it('falls back to localStorage when there is no hash', () => {
    expect(resolveInitialConfig('', JSON.stringify(SAMPLE_CONFIG))).toEqual(SAMPLE_CONFIG);
  });

  it('falls back to defaults when neither hash nor storage has data', () => {
    expect(resolveInitialConfig('', null)).toEqual(DEFAULT_CONFIG);
  });

  it('falls back to defaults when both hash and storage are corrupt', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(resolveInitialConfig('#c=not-valid', '{not valid json')).toEqual(DEFAULT_CONFIG);
  });
});

describe('useClockConfig — shared_config_loaded analytics event', () => {
  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('fires shared_config_loaded when the initial config was loaded from a share link', async () => {
    window.history.replaceState(null, '', `#c=${encodeConfig(SAMPLE_CONFIG)}`);
    const analytics = createMockAnalyticsService();

    renderHook(() => useClockConfig(), {
      wrapper: ({ children }) => <AnalyticsProvider service={analytics}>{children}</AnalyticsProvider>,
    });

    await waitFor(() =>
      expect(analytics.trackEvent).toHaveBeenCalledWith('shared_config_loaded', {
        location_count: SAMPLE_CONFIG.rings.length + 1,
        has_meetings: SAMPLE_CONFIG.meetings.length > 0,
        source: 'hash',
      }),
    );
  });

  it('does not fire shared_config_loaded when there is no share link in the hash', () => {
    const analytics = createMockAnalyticsService();

    renderHook(() => useClockConfig(), {
      wrapper: ({ children }) => <AnalyticsProvider service={analytics}>{children}</AnalyticsProvider>,
    });

    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });
});

describe('useClockConfig — URL mirror path', () => {
  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  function renderClockConfig() {
    const analytics = createMockAnalyticsService();
    renderHook(() => useClockConfig(), {
      wrapper: ({ children }) => <AnalyticsProvider service={analytics}>{children}</AnalyticsProvider>,
    });
  }

  // the extension popup runs this same hook at chrome-extension://<id>/popup.html
  it('keeps a non-short-link path (e.g. /popup.html) and only rewrites the hash', () => {
    window.history.replaceState(null, '', '/popup.html');

    renderClockConfig();

    expect(window.location.pathname).toBe('/popup.html');
    expect(window.location.hash).toBe(`#c=${encodeConfig(DEFAULT_CONFIG)}`);
  });

  // the developer's stated preference: the address bar must never change away
  // from a path the user actually typed or opened, so a short-link-shaped
  // path is kept even once a hash is mirrored alongside it
  it('a hash link opened at a short-link-shaped path keeps the path, only the hash is rewritten', () => {
    window.history.replaceState(null, '', `/abc123#c=${encodeConfig(SAMPLE_CONFIG)}`);

    renderClockConfig();

    expect(window.location.pathname).toBe('/abc123');
    expect(window.location.hash).toBe(`#c=${encodeConfig(SAMPLE_CONFIG)}`);
  });
});
