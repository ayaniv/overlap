import posthog from 'posthog-js';
import type { AnalyticsService } from './AnalyticsService';

let initialized = false;

// deferred to first use (not import time) so importing the analytics module — which
// every migrated component will do via useAnalytics — never triggers PostHog init as
// a side effect in tests; production behavior is unchanged, since the first real
// event still initializes PostHog before sending
function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  posthog.init(import.meta.env.VITE_POSTHOG_PROJECT_TOKEN, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,
    defaults: '2026-05-30',
  });
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
