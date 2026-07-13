import { afterEach, describe, expect, it, vi } from 'vitest';
import { analytics } from '../analytics/analytics';
import {
  buildEventPayload,
  createCalendarEvent,
  deleteCalendarEvent,
  deleteMeetingFromGoogleCalendar,
  getGoogleClientId,
  isGoogleCalendarConnected,
  requestAccessToken,
  scheduleMeetingOnGoogleCalendar,
} from './googleCalendar';
import type { GoogleOAuth2, TokenResponse } from './googleCalendar';

vi.mock('../analytics/analytics', () => ({
  analytics: { trackEvent: vi.fn() },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(analytics.trackEvent).mockClear();
  window.localStorage.clear();
});

describe('getGoogleClientId', () => {
  it('is undefined when the env var is unset', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    expect(getGoogleClientId()).toBeUndefined();
  });

  it('returns the client id when set', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'abc123.apps.googleusercontent.com');
    expect(getGoogleClientId()).toBe('abc123.apps.googleusercontent.com');
  });

  it('trims leading/trailing whitespace, e.g. from a copy-pasted Cloud Console value', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '  abc123.apps.googleusercontent.com  ');
    expect(getGoogleClientId()).toBe('abc123.apps.googleusercontent.com');
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

  it('marks Google Calendar as connected on a successful sign-in', async () => {
    expect(isGoogleCalendarConnected()).toBe(false);
    const oauth2 = fakeOAuth2((callback) => callback({ access_token: 'tok-123' }));
    await requestAccessToken('client-id', oauth2);
    expect(isGoogleCalendarConnected()).toBe(true);
    expect(analytics.trackEvent).toHaveBeenCalledWith('google_calendar_connected', { action: 'click' });
  });

  it('rejects and logs when the token response has no access token', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const oauth2 = fakeOAuth2((callback) => callback({ error: 'access_denied' }));
    await expect(requestAccessToken('client-id', oauth2)).rejects.toThrow('access_denied');
    expect(errorSpy).toHaveBeenCalled();
    expect(isGoogleCalendarConnected()).toBe(false);
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
    expect(isGoogleCalendarConnected()).toBe(false);
  });
});

describe('isGoogleCalendarConnected', () => {
  it('is false when nothing has been persisted yet', () => {
    expect(isGoogleCalendarConnected()).toBe(false);
  });

  it('is true once the connected flag has been persisted', () => {
    window.localStorage.setItem('overlap:google-connected:v1', 'true');
    expect(isGoogleCalendarConnected()).toBe(true);
  });

  it('logs and returns false if localStorage throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(isGoogleCalendarConnected()).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});

function okJsonResponse(body: unknown) {
  return { ok: true, json: () => Promise.resolve(body) };
}

describe('createCalendarEvent', () => {
  it('posts the event payload and resolves with the created event id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJsonResponse({ id: 'evt-123' }));
    await expect(createCalendarEvent('tok-123', 'Sync', '2026-01-01T10:00:00.000Z', 30, fetchImpl)).resolves.toBe('evt-123');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }) }),
    );
  });

  it('respects a custom duration in the posted payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJsonResponse({ id: 'evt-123' }));
    await createCalendarEvent('tok-123', 'Sync', '2026-01-01T10:00:00.000Z', 45, fetchImpl);
    const [, options] = fetchImpl.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.end.dateTime).toBe('2026-01-01T10:45:00.000Z');
  });

  it('defaults to a 30-minute event when no duration is given', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJsonResponse({ id: 'evt-123' }));
    await createCalendarEvent('tok-123', 'Sync', '2026-01-01T10:00:00.000Z', undefined, fetchImpl);
    const [, options] = fetchImpl.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.end.dateTime).toBe('2026-01-01T10:30:00.000Z');
  });

  it('throws and logs when the API responds with a non-2xx status', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve('forbidden') });
    await expect(createCalendarEvent('tok-123', 'Sync', '2026-01-01T10:00:00.000Z', 30, fetchImpl)).rejects.toThrow(
      'failed to create the calendar event',
    );
    expect(errorSpy).toHaveBeenCalledWith('overlap: Google Calendar event creation failed', 403, 'forbidden');
  });

  it('throws and logs when the response body has no usable event id', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(okJsonResponse({ summary: 'Sync' }));
    await expect(createCalendarEvent('tok-123', 'Sync', '2026-01-01T10:00:00.000Z', 30, fetchImpl)).rejects.toThrow(
      'could not read its id',
    );
    expect(errorSpy).toHaveBeenCalled();
  });

  it('propagates a network-level rejection', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(createCalendarEvent('tok-123', 'Sync', '2026-01-01T10:00:00.000Z', 30, fetchImpl)).rejects.toThrow('network down');
  });
});

describe('deleteCalendarEvent', () => {
  it('sends a DELETE request for the given event id and resolves on a 2xx response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await deleteCalendarEvent('tok-123', 'evt-123', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/evt-123',
      expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }) }),
    );
  });

  it('treats a 410 (already gone) as success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 410, text: () => Promise.resolve('gone') });
    await expect(deleteCalendarEvent('tok-123', 'evt-123', fetchImpl)).resolves.toBeUndefined();
  });

  it('throws and logs on a non-2xx, non-410 status', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve('forbidden') });
    await expect(deleteCalendarEvent('tok-123', 'evt-123', fetchImpl)).rejects.toThrow('failed to delete the calendar event');
    expect(errorSpy).toHaveBeenCalledWith('overlap: Google Calendar event deletion failed', 403, 'forbidden');
  });

  it('propagates a network-level rejection', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(deleteCalendarEvent('tok-123', 'evt-123', fetchImpl)).rejects.toThrow('network down');
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

  it('resolves with the created event id once sign-in and event creation both succeed', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id');
    const oauth2 = fakeOAuth2((callback) => callback({ access_token: 'tok-123' }));
    vi.stubGlobal('window', { google: { accounts: { oauth2 } } });
    const fetchImpl = vi.fn().mockResolvedValue(okJsonResponse({ id: 'evt-123' }));
    vi.stubGlobal('fetch', fetchImpl);

    await expect(scheduleMeetingOnGoogleCalendar('Sync', '2026-01-01T10:00:00.000Z')).resolves.toBe('evt-123');

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }) }),
    );
  });

  it('rejects and logs when event creation fails after a successful sign-in', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const oauth2 = fakeOAuth2((callback) => callback({ access_token: 'tok-123' }));
    vi.stubGlobal('window', { google: { accounts: { oauth2 } } });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('boom') });
    vi.stubGlobal('fetch', fetchImpl);

    await expect(scheduleMeetingOnGoogleCalendar('Sync', '2026-01-01T10:00:00.000Z')).rejects.toThrow(
      'failed to create the calendar event',
    );
    expect(errorSpy).toHaveBeenCalledWith('overlap: Google Calendar event creation failed', 500, 'boom');
  });

  it('rejects and never touches the network when sign-in fails', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const oauth2 = fakeOAuth2((callback) => callback({ error: 'access_denied' }));
    vi.stubGlobal('window', { google: { accounts: { oauth2 } } });
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);

    await expect(scheduleMeetingOnGoogleCalendar('Sync', '2026-01-01T10:00:00.000Z')).rejects.toThrow('access_denied');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('deleteMeetingFromGoogleCalendar', () => {
  it('throws without touching the network when no client id is configured', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    await expect(deleteMeetingFromGoogleCalendar('evt-123')).rejects.toThrow('Google Calendar is not configured');
  });

  it('resolves once sign-in and event deletion both succeed — deletion re-signs-in rather than reusing a stored token', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id');
    const oauth2 = fakeOAuth2((callback) => callback({ access_token: 'tok-123' }));
    vi.stubGlobal('window', { google: { accounts: { oauth2 } } });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchImpl);

    await expect(deleteMeetingFromGoogleCalendar('evt-123')).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/evt-123',
      expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }) }),
    );
  });

  it('rejects and logs when event deletion fails after a successful sign-in', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const oauth2 = fakeOAuth2((callback) => callback({ access_token: 'tok-123' }));
    vi.stubGlobal('window', { google: { accounts: { oauth2 } } });
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('boom') });
    vi.stubGlobal('fetch', fetchImpl);

    await expect(deleteMeetingFromGoogleCalendar('evt-123')).rejects.toThrow('failed to delete the calendar event');
    expect(errorSpy).toHaveBeenCalledWith('overlap: Google Calendar event deletion failed', 500, 'boom');
  });

  it('rejects and never touches the network when sign-in fails', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const oauth2 = fakeOAuth2((callback) => callback({ error: 'access_denied' }));
    vi.stubGlobal('window', { google: { accounts: { oauth2 } } });
    const fetchImpl = vi.fn();
    vi.stubGlobal('fetch', fetchImpl);

    await expect(deleteMeetingFromGoogleCalendar('evt-123')).rejects.toThrow('access_denied');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});
