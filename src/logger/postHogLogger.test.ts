import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    captureException: vi.fn(),
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// resets the module registry so ensurePostHogInitialized's private `initialized`
// flag and the posthog-js mock both start fresh — see postHogAdapter.test.ts
describe('postHogLogger', () => {
  it('does not initialize PostHog just by being imported', async () => {
    vi.resetModules();
    const posthog = (await import('posthog-js')).default;
    await import('./postHogLogger');

    expect(posthog.init).not.toHaveBeenCalled();
  });

  it('initializes PostHog exactly once, with the configured token/host/defaults, then delegates error() to posthog.captureException', async () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', 'test-token');
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://posthog.example.com');
    vi.resetModules();
    const posthog = (await import('posthog-js')).default;
    const { postHogLogger } = await import('./postHogLogger');
    const error = new Error('boom');

    postHogLogger.error(error);

    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.init).toHaveBeenCalledWith('test-token', {
      api_host: 'https://posthog.example.com',
      defaults: '2026-05-30',
    });
    expect(posthog.captureException).toHaveBeenCalledWith(error);
  });

  it('delegates debug/info/warn to the console, without touching PostHog', async () => {
    vi.resetModules();
    const posthog = (await import('posthog-js')).default;
    const { postHogLogger } = await import('./postHogLogger');
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    postHogLogger.debug('loaded config');
    postHogLogger.info('connected to Google Calendar');
    postHogLogger.warn('retrying request');

    expect(debugSpy).toHaveBeenCalledWith('overlap: loaded config');
    expect(infoSpy).toHaveBeenCalledWith('overlap: connected to Google Calendar');
    expect(warnSpy).toHaveBeenCalledWith('overlap: retrying request');
    expect(posthog.init).not.toHaveBeenCalled();
  });
});
