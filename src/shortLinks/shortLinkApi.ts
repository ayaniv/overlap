import { isValidClockConfig } from '../clock/configValidation';
import type { ClockConfig } from '../clock/types';

export const SHORT_LINK_REQUEST_TIMEOUT_MS = 5000;

// single path segment, overlap-api's nanoid alphabet, no dots (so /privacy.html,
// /robots.txt etc. are never mistaken for ids); 64 max leaves room for the
// architecture doc's human-chosen `/my-name` slugs, not just nanoid(10)
const SHORT_LINK_PATH_PATTERN = /^\/([A-Za-z0-9_-]{1,64})\/?$/;

export type ShortLinkFailureReason =
  | 'not_found'
  | 'rejected'
  | 'server_error'
  | 'network'
  | 'timeout'
  | 'invalid_response'
  | 'aborted';

export type CreateShortLinkResult = { ok: true; id: string } | { ok: false; reason: ShortLinkFailureReason };
export type ResolveShortLinkResult = { ok: true; config: ClockConfig } | { ok: false; reason: ShortLinkFailureReason };

export function parseShortLinkId(pathname: string): string | null {
  const match = SHORT_LINK_PATH_PATTERN.exec(pathname);
  return match ? match[1] : null;
}

export function buildShortLinkUrl(origin: string, id: string): string {
  return `${origin}/${id}`;
}

type RequestResult = { ok: true; status: number; body: unknown } | { ok: false; reason: ShortLinkFailureReason };

// the timeout/abort/network mapping every request shares: build the combined
// signal inside the same try as the fetch, since AbortSignal.any throws a
// TypeError on a browser too old to support it (mapped to 'network' below,
// not left to crash the caller)
async function requestJson(fetchImpl: typeof fetch, url: string, init: RequestInit, signal?: AbortSignal): Promise<RequestResult> {
  try {
    const combinedSignal = AbortSignal.any(signal ? [AbortSignal.timeout(SHORT_LINK_REQUEST_TIMEOUT_MS), signal] : [AbortSignal.timeout(SHORT_LINK_REQUEST_TIMEOUT_MS)]);
    const response = await fetchImpl(url, { ...init, signal: combinedSignal });

    if (response.status === 404) return { ok: false, reason: 'not_found' };
    if (response.status === 400) return { ok: false, reason: 'rejected' };
    if (!response.ok) return { ok: false, reason: 'server_error' };

    try {
      const body: unknown = await response.json();
      return { ok: true, status: response.status, body };
    } catch {
      return { ok: false, reason: 'invalid_response' };
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') return { ok: false, reason: 'timeout' };
    if (err instanceof DOMException && err.name === 'AbortError') return { ok: false, reason: 'aborted' };
    return { ok: false, reason: 'network' };
  }
}

export async function createShortLink(
  baseUrl: string,
  config: ClockConfig,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<CreateShortLinkResult> {
  const body = JSON.stringify({ home: config.home, rings: config.rings, meetings: [] });
  const result = await requestJson(
    fetchImpl,
    `${baseUrl}/links`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
    signal,
  );

  if (!result.ok) return result;
  if (typeof result.body !== 'object' || result.body === null || typeof (result.body as { id?: unknown }).id !== 'string') {
    return { ok: false, reason: 'invalid_response' };
  }
  return { ok: true, id: (result.body as { id: string }).id };
}

export async function resolveShortLink(
  baseUrl: string,
  id: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ResolveShortLinkResult> {
  const result = await requestJson(fetchImpl, `${baseUrl}/links/${encodeURIComponent(id)}`, {}, signal);

  if (!result.ok) return result;
  if (!isValidClockConfig(result.body)) return { ok: false, reason: 'invalid_response' };
  return { ok: true, config: result.body };
}
