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

// each case resets the module registry so ensurePostHogInitialized's private
// `initialized` flag and the posthog-js mock both start fresh — mirrors the
// pattern already used for loadGoogleIdentityServices's module-level cache in
// googleCalendar.test.ts
describe('ensurePostHogInitialized', () => {
  it('does not initialize PostHog just by being imported', async () => {
    vi.resetModules();
    const posthog = (await import('posthog-js')).default;
    await import('./posthogClient');

    expect(posthog.init).not.toHaveBeenCalled();
  });

  it('initializes PostHog exactly once, with the configured token/host/defaults, across repeated calls', async () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'test-token');
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://posthog.example.com');
    vi.resetModules();
    const posthog = (await import('posthog-js')).default;
    const { ensurePostHogInitialized } = await import('./posthogClient');

    ensurePostHogInitialized();
    ensurePostHogInitialized();

    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.init).toHaveBeenCalledWith('test-token', {
      api_host: 'https://posthog.example.com',
      defaults: '2026-05-30',
    });
  });

  it('skips init and logs a warning, without throwing, when the token or host env var is missing', async () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', '');
    vi.stubEnv('VITE_POSTHOG_HOST', '');
    vi.resetModules();
    const posthog = (await import('posthog-js')).default;
    const { ensurePostHogInitialized } = await import('./posthogClient');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => ensurePostHogInitialized()).not.toThrow();

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
    const { ensurePostHogInitialized } = await import('./posthogClient');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => ensurePostHogInitialized()).not.toThrow();

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
