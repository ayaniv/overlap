import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// each case resets the module registry so postHogAdapter's private `initialized`
// flag and the posthog-js mock both start fresh — mirrors the pattern already used
// for loadGoogleIdentityServices's module-level cache in googleCalendar.test.ts
describe('postHogAdapter', () => {
  it('does not initialize PostHog just by being imported', async () => {
    vi.resetModules();
    const posthog = (await import('posthog-js')).default;
    await import('./postHogAdapter');

    expect(posthog.init).not.toHaveBeenCalled();
  });

  it('initializes PostHog exactly once, with the configured token/host/defaults, then delegates every call to posthog.capture', async () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'test-token');
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://posthog.example.com');
    vi.resetModules();
    const posthog = (await import('posthog-js')).default;
    const { postHogAdapter } = await import('./postHogAdapter');

    postHogAdapter.trackEvent('location_added', { timezone_id: 'Asia/Tokyo' });
    postHogAdapter.trackEvent('location_removed');

    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.init).toHaveBeenCalledWith('test-token', {
      api_host: 'https://posthog.example.com',
      defaults: '2026-05-30',
    });
    expect(posthog.capture).toHaveBeenNthCalledWith(1, 'location_added', { timezone_id: 'Asia/Tokyo' });
    expect(posthog.capture).toHaveBeenNthCalledWith(2, 'location_removed', undefined);
  });

});

// config-missing/init-throws edge cases live in ../posthog/posthogClient.test.ts —
// ensurePostHogInitialized is shared by every adapter, so those cases are only
// covered once, at the source, rather than re-verified per adapter.
