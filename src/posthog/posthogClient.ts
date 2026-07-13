import posthog from 'posthog-js';

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

// deferred to first use (not import time) so importing this module — via either
// the analytics adapter or the logger adapter — never triggers PostHog init as a
// side effect in tests; production behavior is unchanged, since the first real
// event still initializes PostHog before sending. Shared (rather than duplicated
// per-adapter) so the two adapters can't each independently call posthog.init.
export function ensurePostHogInitialized(): void {
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
