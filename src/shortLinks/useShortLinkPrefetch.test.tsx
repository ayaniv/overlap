import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { LoggerProvider } from '../logger/LoggerProvider';
import { createMockLoggerService } from '../logger/mockLoggerService';
import type { MockLoggerService } from '../logger/mockLoggerService';
import type { ClockConfig } from '../clock/types';
import { useShortLinkPrefetch } from './useShortLinkPrefetch';

const OVERLAP_API_URL = 'http://api.test';

const CONFIG_A: ClockConfig = {
  home: { id: 'tel-aviv', label: 'Tel Aviv', timezoneId: 'Asia/Jerusalem', color: '#38BDF8', workStart: 9, workEnd: 18 },
  rings: [],
  meetings: [],
};
const CONFIG_B: ClockConfig = { ...CONFIG_A, rings: [{ ...CONFIG_A.home, id: 'london', label: 'London', timezoneId: 'Europe/London' }] };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let fetchMock: Mock<typeof fetch>;
let logger: MockLoggerService;

function renderPrefetch(initialProps: { config: ClockConfig; shouldPrefetch: boolean }) {
  return renderHook(({ config, shouldPrefetch }) => useShortLinkPrefetch(config, shouldPrefetch), {
    initialProps,
    wrapper: ({ children }: { children: ReactNode }) => <LoggerProvider service={logger}>{children}</LoggerProvider>,
  });
}

beforeEach(() => {
  vi.stubEnv('VITE_OVERLAP_API_URL', OVERLAP_API_URL);
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  logger = createMockLoggerService();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('useShortLinkPrefetch', () => {
  it('does nothing while shouldPrefetch is false', () => {
    const { result } = renderPrefetch({ config: CONFIG_A, shouldPrefetch: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current()).toBeNull();
  });

  it('creates a link once shouldPrefetch turns true, and returns its full URL once ready', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'abc123' }));
    const { result, rerender } = renderPrefetch({ config: CONFIG_A, shouldPrefetch: false });

    rerender({ config: CONFIG_A, shouldPrefetch: true });

    await waitFor(() => expect(result.current()).toBe(`${window.location.origin}/abc123`));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null while the POST is still in flight', () => {
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
    const { result } = renderPrefetch({ config: CONFIG_A, shouldPrefetch: true });
    expect(result.current()).toBeNull();
  });

  it('never returns a link created for a different config than the current one', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'for-a' }));
    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));
    const { result, rerender } = renderPrefetch({ config: CONFIG_A, shouldPrefetch: true });
    await waitFor(() => expect(result.current()).toBe(`${window.location.origin}/for-a`));

    rerender({ config: CONFIG_B, shouldPrefetch: true });

    expect(result.current()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not POST again for a config it already has a link for', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'abc123' }));
    const { result, rerender } = renderPrefetch({ config: CONFIG_A, shouldPrefetch: true });
    await waitFor(() => expect(result.current()).not.toBeNull());

    rerender({ config: CONFIG_A, shouldPrefetch: false });
    rerender({ config: { ...CONFIG_A }, shouldPrefetch: true });
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('logs a failed POST and does not retry it for the same config (no hammering a down API)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result, rerender } = renderPrefetch({ config: CONFIG_A, shouldPrefetch: true });

    await waitFor(() => expect(logger.error).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('short link')));
    rerender({ config: CONFIG_A, shouldPrefetch: false });
    rerender({ config: CONFIG_A, shouldPrefetch: true });
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current()).toBeNull();
  });

  it('is fully inert when VITE_OVERLAP_API_URL is unset', async () => {
    vi.stubEnv('VITE_OVERLAP_API_URL', '');
    const { result } = renderPrefetch({ config: CONFIG_A, shouldPrefetch: true });
    await act(async () => {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current()).toBeNull();
  });
});
