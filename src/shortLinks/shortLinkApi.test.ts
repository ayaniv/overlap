import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { ClockConfig } from '../clock/types';
import { buildShortLinkUrl, createShortLink, parseShortLinkId, resolveShortLink } from './shortLinkApi';

const API_BASE_URL = 'http://localhost:3000';

const SAMPLE_CONFIG: ClockConfig = {
  home: { id: 'tel-aviv', label: 'Tel Aviv', timezoneId: 'Asia/Jerusalem', color: '#38BDF8', workStart: 9, workEnd: 18 },
  rings: [{ id: 'san-francisco', label: 'San Francisco', timezoneId: 'America/Los_Angeles', color: '#FB7185', workStart: 9, workEnd: 18 }],
  meetings: [{ id: 'm1', startISO: '2026-09-18T15:00:00.000Z', title: 'Tel Aviv / San Francisco', googleEventId: 'google-event-1' }],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let fetchMock: Mock<typeof fetch>;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
});

describe('parseShortLinkId', () => {
  it('extracts a nanoid-shaped id from a single-segment path', () => {
    expect(parseShortLinkId('/V1StGXR8_Z')).toBe('V1StGXR8_Z');
  });

  it('accepts a human-chosen slug like /my-name (the architecture doc’s own example)', () => {
    expect(parseShortLinkId('/my-name')).toBe('my-name');
  });

  it('tolerates one trailing slash', () => {
    expect(parseShortLinkId('/abc123/')).toBe('abc123');
  });

  it('returns null for the root path — that is the normal app, not a short link', () => {
    expect(parseShortLinkId('/')).toBeNull();
    expect(parseShortLinkId('')).toBeNull();
  });

  it('returns null for static-file-looking paths (anything with a dot)', () => {
    expect(parseShortLinkId('/privacy.html')).toBeNull();
    expect(parseShortLinkId('/index.html')).toBeNull();
  });

  it('returns null for nested paths', () => {
    expect(parseShortLinkId('/a/b')).toBeNull();
  });

  it('returns null for an id longer than the accepted maximum', () => {
    expect(parseShortLinkId(`/${'a'.repeat(65)}`)).toBeNull();
  });
});

describe('buildShortLinkUrl', () => {
  it('joins the page origin and the id into a path-based URL', () => {
    expect(buildShortLinkUrl('https://overlapclock.com', 'abc123')).toBe('https://overlapclock.com/abc123');
  });
});

describe('createShortLink', () => {
  it('POSTs the config as JSON to /links and returns the new id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'abc123' }));

    const result = await createShortLink(API_BASE_URL, SAMPLE_CONFIG, fetchMock);

    expect(result).toEqual({ ok: true, id: 'abc123' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/links`);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('never sends meetings to the server — they carry Google Calendar event ids (Google user data)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'abc123' }));

    await createShortLink(API_BASE_URL, SAMPLE_CONFIG, fetchMock);

    const body: unknown = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toEqual({ home: SAMPLE_CONFIG.home, rings: SAMPLE_CONFIG.rings, meetings: [] });
  });

  it('reports "rejected" when the API refuses the payload (400)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: 'home.color must be a hex color (e.g. #ff0000)' }));
    expect(await createShortLink(API_BASE_URL, SAMPLE_CONFIG, fetchMock)).toEqual({ ok: false, reason: 'rejected' });
  });

  it('reports "server_error" on a 5xx', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'internal server error' }));
    expect(await createShortLink(API_BASE_URL, SAMPLE_CONFIG, fetchMock)).toEqual({ ok: false, reason: 'server_error' });
  });

  it('reports "network" when fetch itself rejects (API down, CORS refused, offline)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await createShortLink(API_BASE_URL, SAMPLE_CONFIG, fetchMock)).toEqual({ ok: false, reason: 'network' });
  });

  it('reports "timeout" when the request is aborted by its timeout signal', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'));
    expect(await createShortLink(API_BASE_URL, SAMPLE_CONFIG, fetchMock)).toEqual({ ok: false, reason: 'timeout' });
  });

  it('reports "invalid_response" when a 200 body has no string id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { nope: true }));
    expect(await createShortLink(API_BASE_URL, SAMPLE_CONFIG, fetchMock)).toEqual({ ok: false, reason: 'invalid_response' });
  });

  it('reports "invalid_response" when a 200 body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>oops</html>', { status: 200 }));
    expect(await createShortLink(API_BASE_URL, SAMPLE_CONFIG, fetchMock)).toEqual({ ok: false, reason: 'invalid_response' });
  });
});

describe('resolveShortLink', () => {
  it('GETs /links/:id and returns the stored config', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ...SAMPLE_CONFIG, meetings: [] }));

    const result = await resolveShortLink(API_BASE_URL, 'abc123', fetchMock);

    expect(result).toEqual({ ok: true, config: { ...SAMPLE_CONFIG, meetings: [] } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/links/abc123`);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('URL-encodes the id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'link not found' }));
    await resolveShortLink(API_BASE_URL, 'a b', fetchMock);
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE_URL}/links/a%20b`);
  });

  it('reports "not_found" for a dead/nonexistent link (404)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'link not found' }));
    expect(await resolveShortLink(API_BASE_URL, 'missing', fetchMock)).toEqual({ ok: false, reason: 'not_found' });
  });

  it('reports "server_error" on a 5xx', async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { error: 'unavailable' }));
    expect(await resolveShortLink(API_BASE_URL, 'abc123', fetchMock)).toEqual({ ok: false, reason: 'server_error' });
  });

  it('reports "network" when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await resolveShortLink(API_BASE_URL, 'abc123', fetchMock)).toEqual({ ok: false, reason: 'network' });
  });

  it('reports "timeout" when the request times out', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'));
    expect(await resolveShortLink(API_BASE_URL, 'abc123', fetchMock)).toEqual({ ok: false, reason: 'timeout' });
  });

  it('reports "invalid_response" when the 200 body is not a valid ClockConfig — never trusts the server blindly', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { home: 'not a location' }));
    expect(await resolveShortLink(API_BASE_URL, 'abc123', fetchMock)).toEqual({ ok: false, reason: 'invalid_response' });
  });

  it('forwards a caller-provided abort signal, so an unmount can cancel an in-flight resolve', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url, init) => {
      expect(init?.signal?.aborted).toBe(false);
      controller.abort();
      expect(init?.signal?.aborted).toBe(true);
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });

    expect(await resolveShortLink(API_BASE_URL, 'abc123', fetchMock, controller.signal)).toEqual({ ok: false, reason: 'aborted' });
  });
});
