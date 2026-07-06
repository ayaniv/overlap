import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildEventPayload,
  createCalendarEvent,
  getGoogleClientId,
  isGoogleCalendarConfigured,
  requestAccessToken,
  scheduleMeetingOnGoogleCalendar,
} from './googleCalendar';
import type { GoogleOAuth2, TokenResponse } from './googleCalendar';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getGoogleClientId / isGoogleCalendarConfigured', () => {
  it('is undefined/false when the env var is unset', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    expect(getGoogleClientId()).toBeUndefined();
    expect(isGoogleCalendarConfigured()).toBe(false);
  });

  it('returns the trimmed client id when set', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'abc123.apps.googleusercontent.com');
    expect(getGoogleClientId()).toBe('abc123.apps.googleusercontent.com');
    expect(isGoogleCalendarConfigured()).toBe(true);
  });
});

describe('buildEventPayload', () => {
  it('defaults to a 30-minute event', () => {
    const payload = buildEventPayload('Sync', '2026-01-01T10:00:00.000Z');
    expect(payload).toEqual({
      summary: 'Sync',
      start: { dateTime: '2026-01-01T10:00:00.000Z' },
      end: { dateTime: '2026-01-01T10:30:00.000Z' },
    });
  });

  it('respects a custom duration', () => {
    const payload = buildEventPayload('Sync', '2026-01-01T10:00:00.000Z', 60);
    expect(payload.end.dateTime).toBe('2026-01-01T11:00:00.000Z');
  });
});

function fakeOAuth2(respond: (callback: (response: TokenResponse) => void) => void): GoogleOAuth2 {
  return {
    initTokenClient: (config) => ({
      requestAccessToken: () => respond(config.callback),
    }),
  };
}

describe('requestAccessToken', () => {
  it('resolves with the access token on success', async () => {
    const oauth2 = fakeOAuth2((callback) => callback({ access_token: 'tok-123' }));
    await expect(requestAccessToken('client-id', oauth2)).resolves.toBe('tok-123');
  });

  it('rejects and logs when the token response has no access token', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const oauth2 = fakeOAuth2((callback) => callback({ error: 'access_denied' }));
    await expect(requestAccessToken('client-id', oauth2)).rejects.toThrow('access_denied');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('rejects and logs when the sign-in popup is closed/blocked', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const oauth2: GoogleOAuth2 = {
      initTokenClient: (config) => ({
        requestAccessToken: () => config.error_callback?.({ type: 'popup_closed' }),
      }),
    };
    await expect(requestAccessToken('client-id', oauth2)).rejects.toThrow('popup_closed');
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('createCalendarEvent', () => {
  it('posts the event payload and resolves on a 2xx response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await createCalendarEvent('tok-123', 'Sync', '2026-01-01T10:00:00.000Z', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }) }),
    );
  });

  it('throws and logs when the API responds with a non-2xx status', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve('forbidden') });
    await expect(createCalendarEvent('tok-123', 'Sync', '2026-01-01T10:00:00.000Z', fetchImpl)).rejects.toThrow(
      'failed to create the calendar event',
    );
    expect(errorSpy).toHaveBeenCalledWith('overlap: Google Calendar event creation failed', 403, 'forbidden');
  });

  it('propagates a network-level rejection', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(createCalendarEvent('tok-123', 'Sync', '2026-01-01T10:00:00.000Z', fetchImpl)).rejects.toThrow('network down');
  });
});

describe('loadGoogleIdentityServices', () => {
  // gisLoadPromise is a module-level cache, so each case re-imports a fresh module
  // instance instead of sharing state (and a "loaded" result) across cases
  it('resolves immediately when the API is already on window', async () => {
    vi.resetModules();
    const oauth2 = fakeOAuth2(() => {});
    vi.stubGlobal('window', { google: { accounts: { oauth2 } } });
    const { loadGoogleIdentityServices } = await import('./googleCalendar');
    await expect(loadGoogleIdentityServices()).resolves.toBe(oauth2);
  });

  it('injects a script tag and resolves once it loads', async () => {
    vi.resetModules();
    const oauth2 = fakeOAuth2(() => {});
    const windowStub: { google?: { accounts: { oauth2: GoogleOAuth2 } } } = {};
    vi.stubGlobal('window', windowStub);

    const script: { src?: string; async?: boolean; onload?: () => void; onerror?: () => void } = {};
    const head = { appendChild: vi.fn() };
    vi.stubGlobal('document', { createElement: vi.fn().mockReturnValue(script), head });

    const { loadGoogleIdentityServices } = await import('./googleCalendar');
    const promise = loadGoogleIdentityServices();
    expect(head.appendChild).toHaveBeenCalledWith(script);
    windowStub.google = { accounts: { oauth2 } };
    script.onload?.();

    await expect(promise).resolves.toBe(oauth2);
  });

  it('rejects and logs when the script fails to load', async () => {
    vi.resetModules();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('window', {});
    const script: { onload?: () => void; onerror?: () => void } = {};
    vi.stubGlobal('document', { createElement: vi.fn().mockReturnValue(script), head: { appendChild: vi.fn() } });

    const { loadGoogleIdentityServices } = await import('./googleCalendar');
    const promise = loadGoogleIdentityServices();
    script.onerror?.();

    await expect(promise).rejects.toThrow('failed to load the Google Identity Services script');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('rejects and logs when the script neither loads nor errors within the timeout', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    try {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.stubGlobal('window', {});
      const script: { onload?: () => void; onerror?: () => void } = {};
      vi.stubGlobal('document', { createElement: vi.fn().mockReturnValue(script), head: { appendChild: vi.fn() } });

      const { loadGoogleIdentityServices } = await import('./googleCalendar');
      const promise = loadGoogleIdentityServices();
      const assertion = expect(promise).rejects.toThrow('timed out loading the Google Identity Services script');
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('scheduleMeetingOnGoogleCalendar', () => {
  it('throws without touching the network when no client id is configured', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    await expect(scheduleMeetingOnGoogleCalendar('Sync', '2026-01-01T10:00:00.000Z')).rejects.toThrow(
      'Google Calendar is not configured',
    );
  });
});
