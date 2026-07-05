import { compressToEncodedURIComponent } from 'lz-string';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeConfig, encodeConfig } from './shareCodec';
import type { ClockConfig } from './types';

const SAMPLE_CONFIG: ClockConfig = {
  home: { id: 'tel-aviv', label: 'Tel Aviv', timezoneId: 'Asia/Jerusalem', color: '#38BDF8', workStart: 9, workEnd: 18 },
  rings: [
    { id: 'san-francisco', label: 'San Francisco', timezoneId: 'America/Los_Angeles', color: '#FB7185', workStart: 9, workEnd: 18 },
  ],
  meetings: [{ id: 'm1', startISO: '2026-01-01T10:00:00.000Z', title: 'Sync' }],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shareCodec', () => {
  it('round-trips a config through encode/decode', () => {
    const encoded = encodeConfig(SAMPLE_CONFIG);
    expect(decodeConfig(encoded)).toEqual(SAMPLE_CONFIG);
  });

  it('produces a URL-hash-safe string (no #, %, or whitespace)', () => {
    const encoded = encodeConfig(SAMPLE_CONFIG);
    expect(encoded).toMatch(/^[A-Za-z0-9+-]*$/);
  });

  it('returns null (without logging) when the string does not decompress at all', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(decodeConfig('not-a-valid-encoded-config-$$$')).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns null and logs an error when the decompressed payload is not valid JSON', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const malformed = compressToEncodedURIComponent('{invalid json');
    expect(decodeConfig(malformed)).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('returns null and logs an error when the decoded payload is valid JSON but the wrong shape', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const wrongShape = compressToEncodedURIComponent(JSON.stringify({ foo: 'bar' }));
    expect(decodeConfig(wrongShape)).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('returns null for an empty string', () => {
    expect(decodeConfig('')).toBeNull();
  });
});
