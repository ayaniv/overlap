const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const SCRIPT_LOAD_TIMEOUT_MS = 10_000;
export const DEFAULT_MEETING_DURATION_MINUTES = 30;

// Google Calendar scheduling is entirely client-side (no backend): the user provisions
// their own OAuth Client ID (Vercel env var), and this module drives Google Identity
// Services' token-client popup flow directly from the browser.
export function getGoogleClientId(): string | undefined {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(getGoogleClientId());
}

const CONNECTED_STORAGE_KEY = 'overlap:google-connected:v1';

// distinct from isGoogleCalendarConfigured (a build-time env var): this is a runtime
// "has this browser signed in before" flag, so a meeting synced into a share link's
// config doesn't leak its dot to a viewer who never authenticated on their own device
export function isGoogleCalendarConnected(): boolean {
  try {
    return window.localStorage.getItem(CONNECTED_STORAGE_KEY) === 'true';
  } catch (err) {
    console.error('overlap: failed to read Google Calendar connection state', err);
    return false;
  }
}

function markGoogleCalendarConnected(): void {
  try {
    window.localStorage.setItem(CONNECTED_STORAGE_KEY, 'true');
  } catch (err) {
    console.error('overlap: failed to persist Google Calendar connection state', err);
  }
}

export type EventPayload = {
  summary: string;
  start: { dateTime: string };
  end: { dateTime: string };
};

// pure: builds the Calendar v3 event body; end = start + durationMinutes (30 default)
export function buildEventPayload(title: string, startISO: string, durationMinutes = DEFAULT_MEETING_DURATION_MINUTES): EventPayload {
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { summary: title, start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() } };
}

export type TokenResponse = { access_token?: string; error?: string };
export type TokenClientError = { type: string; message?: string };
export type TokenClient = { requestAccessToken: (overrideConfig?: { prompt?: string }) => void };
export type GoogleOAuth2 = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: TokenClientError) => void;
  }) => TokenClient;
};

declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth2 } };
  }
}

let gisLoadPromise: Promise<GoogleOAuth2> | null = null;

// loads the Google Identity Services script once (idempotent across repeat calls); a
// failed load (including a timeout, so a blocked/offline network fails observably
// instead of leaving the schedule UI stuck on "Scheduling...") clears the cached
// promise so a later retry re-attempts the script tag
export function loadGoogleIdentityServices(): Promise<GoogleOAuth2> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2);
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<GoogleOAuth2>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('overlap: timed out loading the Google Identity Services script')),
      SCRIPT_LOAD_TIMEOUT_MS,
    );
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      if (window.google?.accounts?.oauth2) {
        resolve(window.google.accounts.oauth2);
      } else {
        reject(new Error('overlap: Google Identity Services script loaded without the expected API'));
      }
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error('overlap: failed to load the Google Identity Services script'));
    };
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    gisLoadPromise = null;
    console.error('overlap: failed to load Google Identity Services', err);
    throw err;
  });
  return gisLoadPromise;
}

// requests an OAuth access token via the GIS token-client popup flow, scoped to
// calendar.events; error_callback covers the popup being closed/blocked, which GIS
// otherwise leaves the caller with no signal at all
export function requestAccessToken(clientId: string, oauth2: GoogleOAuth2): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: CALENDAR_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          const err = new Error(`overlap: Google sign-in failed${response.error ? `: ${response.error}` : ''}`);
          console.error(err.message);
          reject(err);
          return;
        }
        markGoogleCalendarConnected();
        resolve(response.access_token);
      },
      error_callback: (error) => {
        const err = new Error(`overlap: Google sign-in was cancelled or failed (${error.type})`);
        console.error(err.message);
        reject(err);
      },
    });
    client.requestAccessToken();
  });
}

// creates a primary-calendar event via the Calendar v3 REST API
export async function createCalendarEvent(
  accessToken: string,
  title: string,
  startISO: string,
  durationMinutes: number = DEFAULT_MEETING_DURATION_MINUTES,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const payload = buildEventPayload(title, startISO, durationMinutes);
  const response = await fetchImpl(EVENTS_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('overlap: Google Calendar event creation failed', response.status, body);
    throw new Error('overlap: failed to create the calendar event');
  }
}

// orchestrates sign-in + event creation; every step logs on failure, and this rethrows
// so the schedule UI can show an inline error without duplicating the message
export async function scheduleMeetingOnGoogleCalendar(
  title: string,
  startISO: string,
  durationMinutes: number = DEFAULT_MEETING_DURATION_MINUTES,
): Promise<void> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error('overlap: Google Calendar is not configured (missing VITE_GOOGLE_CLIENT_ID)');
  }
  const oauth2 = await loadGoogleIdentityServices();
  const accessToken = await requestAccessToken(clientId, oauth2);
  await createCalendarEvent(accessToken, title, startISO, durationMinutes);
}
