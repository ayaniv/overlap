import posthog from 'posthog-js';
import type { AnalyticsService } from './AnalyticsService';

let initialized = false;

// mirrors googleCalendar.ts's getGoogleClientId(): a build-time env var read
// as string | undefined, trimmed, treated as absent when blank
function getPostHogConfig(): { token: string; apiHost: string } | undefined {
  const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
  const apiHost = import.meta.env.VITE_POSTHOG_HOST;
  if (typeof token !== 'string' || !token.trim() || typeof apiHost !== 'string' || !apiHost.trim()) {
    return undefined;
  }
  return { token: token.trim(), apiHost: apiHost.trim() };
}

// deferred to first use (not import time) so importing the analytics module — which
// every migrated component will do via useAnalytics — never triggers PostHog init as
// a side effect in tests; production behavior is unchanged, since the first real
// event still initializes PostHog before sending
function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  const config = getPostHogConfig();
  if (!config) {
    console.warn(
      'overlap: PostHog is not configured (missing VITE_POSTHOG_PROJECT_TOKEN/VITE_POSTHOG_HOST) — analytics events will not be sent',
    );
    return;
  }
  try {
    posthog.init(config.token, {
      api_host: config.apiHost,
      defaults: '2026-05-30',
    });
  } catch (err) {
    console.error('overlap: failed to initialize PostHog', err);
  }
}

export const postHogAdapter: AnalyticsService = {
  trackEvent(name, properties) {
    ensureInitialized();
    posthog.capture(name, properties);
  },
  captureException(error) {
    ensureInitialized();
    posthog.captureException(error);
  },
};
