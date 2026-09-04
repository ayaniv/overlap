import type { AnalyticsService } from '../../src/analytics/AnalyticsService';
import { consoleLogParts } from '../../src/logger/consoleLogParts';
import type { LoggerService } from '../../src/logger/LoggerService';

export const EXTENSION_DISTINCT_ID_STORAGE_KEY = 'overlap:extension-distinct-id:v1';
export const CAPTURE_PATH = '/i/v0/e/';

// mirrors posthogClient.ts's getPostHogConfig(): a build-time env var read as
// string | undefined, trimmed, treated as absent when blank — read at call
// time (not module load) so a test can stub the env before the first capture
function getPostHogConfig(): { token: string; apiHost: string } | undefined {
  const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
  const apiHost = import.meta.env.VITE_POSTHOG_HOST;
  if (typeof token !== 'string' || !token.trim() || typeof apiHost !== 'string' || !apiHost.trim()) {
    return undefined;
  }
  return { token: token.trim(), apiHost: apiHost.trim() };
}

// cached in module scope (not just returned) so a localStorage that keeps
// throwing (e.g. quota exceeded) still yields one stable id for the life of
// this page, rather than a fresh distinct_id — and therefore a fresh
// "session" — on every single capture
let fallbackDistinctId: string | undefined;

function getOrCreateDistinctId(): string {
  try {
    const existing = window.localStorage.getItem(EXTENSION_DISTINCT_ID_STORAGE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(EXTENSION_DISTINCT_ID_STORAGE_KEY, created);
    return created;
  } catch (err) {
    console.error('overlap: failed to persist extension distinct id, generating a throwaway one', err);
    fallbackDistinctId ??= crypto.randomUUID();
    return fallbackDistinctId;
  }
}

// MV3-safe AnalyticsService + LoggerService transport: posthog-js lazy-loads
// remote <script> bundles (recorder, surveys, exception autocapture) that
// MV3's script-src 'self' blocks outright, so the popup can't use the web
// app's postHogAdapter/postHogLogger — this POSTs straight to PostHog's
// capture endpoint instead, with the same "unconfigured -> warn once and
// no-op" contract as the web app.
export function createHttpPostHogService(fetchImpl: typeof fetch = fetch): AnalyticsService & LoggerService {
  let hasWarnedUnconfigured = false;

  function capture(event: string, properties?: Record<string, unknown>): void {
    const config = getPostHogConfig();
    if (!config) {
      if (!hasWarnedUnconfigured) {
        hasWarnedUnconfigured = true;
        console.warn(
          'overlap: PostHog is not configured (missing VITE_POSTHOG_PROJECT_TOKEN/VITE_POSTHOG_HOST) — analytics events will not be sent',
        );
      }
      return;
    }

    const body = JSON.stringify({
      api_key: config.token,
      event,
      distinct_id: getOrCreateDistinctId(),
      properties,
    });

    // keepalive: true — chrome.tabs.create (openWebApp) tears the popup page
    // down the instant it focuses the new tab, which would otherwise cancel
    // this request mid-flight
    fetchImpl(`${config.apiHost}${CAPTURE_PATH}`, { method: 'POST', body, keepalive: true })
      .then((response) => {
        if (!response.ok) {
          console.error('overlap: PostHog capture request failed', event, response.status);
        }
      })
      .catch((err) => {
        console.error('overlap: PostHog capture request threw', event, err);
      });
  }

  return {
    ...consoleLogParts,
    trackEvent(name, properties) {
      capture(name, properties);
    },
    error(err, context) {
      const message = err instanceof Error ? err.message : String(err);
      const type = err instanceof Error ? err.name : typeof err;
      capture('$exception', { context, $exception_message: message, $exception_type: type });
    },
  };
}
