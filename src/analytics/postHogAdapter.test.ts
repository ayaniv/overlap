import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    captureException: vi.fn(),
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
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

  it('initializes PostHog exactly once, then delegates every call to posthog.capture', async () => {
    vi.resetModules();
    const posthog = (await import('posthog-js')).default;
    const { postHogAdapter } = await import('./postHogAdapter');

    postHogAdapter.trackEvent('location_added', { timezone_id: 'Asia/Tokyo' });
    postHogAdapter.trackEvent('location_removed');

    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.capture).toHaveBeenNthCalledWith(1, 'location_added', { timezone_id: 'Asia/Tokyo' });
    expect(posthog.capture).toHaveBeenNthCalledWith(2, 'location_removed', undefined);
  });

  it('delegates captureException to posthog.captureException', async () => {
    vi.resetModules();
    const posthog = (await import('posthog-js')).default;
    const { postHogAdapter } = await import('./postHogAdapter');
    const error = new Error('boom');

    postHogAdapter.captureException(error);

    expect(posthog.captureException).toHaveBeenCalledWith(error);
  });
});
