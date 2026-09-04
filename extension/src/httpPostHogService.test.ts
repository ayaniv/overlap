import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE_PATH, EXTENSION_DISTINCT_ID_STORAGE_KEY, createHttpPostHogService } from './httpPostHogService';

const TOKEN = 'phc_test_token';
const HOST = 'https://us.i.posthog.com';

function okFetch() {
  return vi.fn().mockResolvedValue(new Response('{"status":1}', { status: 200 }));
}

function readCapturedBody(fetchImpl: ReturnType<typeof vi.fn>, callIndex = 0): Record<string, unknown> {
  const [, init] = fetchImpl.mock.calls[callIndex] as [string, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', TOKEN);
  vi.stubEnv('VITE_POSTHOG_HOST', HOST);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('createHttpPostHogService — trackEvent', () => {
  it('POSTs the event to PostHog’s capture endpoint with the project token', async () => {
    const fetchImpl = okFetch();
    const service = createHttpPostHogService(fetchImpl as unknown as typeof fetch);

    service.trackEvent('clock_shared', { outcome: 'copied' });

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${HOST}${CAPTURE_PATH}`);
    expect(init.method).toBe('POST');
    const body = readCapturedBody(fetchImpl);
    expect(body.api_key).toBe(TOKEN);
    expect(body.event).toBe('clock_shared');
    expect(body.properties).toMatchObject({ outcome: 'copied' });
    expect(typeof body.distinct_id).toBe('string');
    expect(body.distinct_id).not.toBe('');
  });

  it('reuses one persisted anonymous distinct id across events and across service instances', async () => {
    const fetchImpl = okFetch();

    createHttpPostHogService(fetchImpl as unknown as typeof fetch).trackEvent('first_event');
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    createHttpPostHogService(fetchImpl as unknown as typeof fetch).trackEvent('second_event');
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    const first = readCapturedBody(fetchImpl, 0).distinct_id;
    const second = readCapturedBody(fetchImpl, 1).distinct_id;
    expect(second).toBe(first);
    expect(window.localStorage.getItem(EXTENSION_DISTINCT_ID_STORAGE_KEY)).toBe(first);
  });
});

describe('createHttpPostHogService — error reporting', () => {
  it('captures an exception event carrying the caller’s context', async () => {
    const fetchImpl = okFetch();
    const service = createHttpPostHogService(fetchImpl as unknown as typeof fetch);

    service.error(new Error('no tabs permission'), 'failed to open the web app from the popup');

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const body = readCapturedBody(fetchImpl);
    expect(body.event).toBe('$exception');
    expect(body.properties).toMatchObject({ context: 'failed to open the web app from the popup' });
    expect(JSON.stringify(body.properties)).toContain('no tabs permission');
  });

  it('writes warn() straight to the console rather than over the network', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = okFetch();

    createHttpPostHogService(fetchImpl as unknown as typeof fetch).warn('popup opened without a stored config');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('createHttpPostHogService — failure paths', () => {
  it('no-ops with a single warning when PostHog is not configured', () => {
    vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', '');
    vi.stubEnv('VITE_POSTHOG_HOST', '');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = okFetch();
    const service = createHttpPostHogService(fetchImpl as unknown as typeof fetch);

    service.trackEvent('clock_shared', { outcome: 'copied' });
    service.error(new Error('boom'), 'while unconfigured');

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('swallows and logs a rejected capture request instead of throwing at the call site', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const service = createHttpPostHogService(fetchImpl as unknown as typeof fetch);

    expect(() => service.trackEvent('clock_shared')).not.toThrow();

    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1));
  });

  it('logs a non-ok capture response', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    const service = createHttpPostHogService(fetchImpl as unknown as typeof fetch);

    service.trackEvent('clock_shared');

    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledTimes(1));
  });

  it('reuses one stable throwaway distinct id across events when localStorage keeps throwing on write', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(window.localStorage, 'getItem').mockReturnValue(null);
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const fetchImpl = okFetch();
    const service = createHttpPostHogService(fetchImpl as unknown as typeof fetch);

    service.trackEvent('first_event');
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    service.trackEvent('second_event');
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    const first = readCapturedBody(fetchImpl, 0).distinct_id;
    const second = readCapturedBody(fetchImpl, 1).distinct_id;
    expect(first).toEqual(expect.any(String));
    expect(second).toBe(first);
  });
});
