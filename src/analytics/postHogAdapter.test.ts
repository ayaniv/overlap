import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    captureException: vi.fn(),
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

  it('delegates captureException to posthog.captureException', async () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'test-token');
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://posthog.example.com');
    vi.resetModules();
    const posthog = (await import('posthog-js')).default;
    const { postHogAdapter } = await import('./postHogAdapter');
    const error = new Error('boom');

    postHogAdapter.captureException(error);

    expect(posthog.captureException).toHaveBeenCalledWith(error);
  });

  it('skips init and logs a warning, without throwing, when the token or host env var is missing', async () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', '');
    vi.stubEnv('VITE_POSTHOG_HOST', '');
    vi.resetModules();
    const posthog = (await import('posthog-js')).default;
    const { postHogAdapter } = await import('./postHogAdapter');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => postHogAdapter.trackEvent('location_added', { timezone_id: 'Asia/Tokyo' })).not.toThrow();

    expect(posthog.init).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('logs and does not throw when posthog.init itself throws', async () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'test-token');
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://posthog.example.com');
    vi.resetModules();
    const posthog = (await import('posthog-js')).default;
    vi.mocked(posthog.init).mockImplementation(() => {
      throw new Error('network unreachable');
    });
    const { postHogAdapter } = await import('./postHogAdapter');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => postHogAdapter.trackEvent('location_added')).not.toThrow();

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
