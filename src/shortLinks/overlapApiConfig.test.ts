import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOverlapApiBaseUrl } from './overlapApiConfig';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getOverlapApiBaseUrl', () => {
  it('returns the configured VITE_OVERLAP_API_URL', () => {
    vi.stubEnv('VITE_OVERLAP_API_URL', 'http://localhost:3000');
    expect(getOverlapApiBaseUrl()).toBe('http://localhost:3000');
  });

  it('strips a trailing slash so callers can always append `/links`', () => {
    vi.stubEnv('VITE_OVERLAP_API_URL', 'https://api.example.com/');
    expect(getOverlapApiBaseUrl()).toBe('https://api.example.com');
  });

  it('returns null when unset — short links are disabled and sharing stays hash-only', () => {
    vi.stubEnv('VITE_OVERLAP_API_URL', '');
    expect(getOverlapApiBaseUrl()).toBeNull();
  });

  it('returns null for a whitespace-only value', () => {
    vi.stubEnv('VITE_OVERLAP_API_URL', '   ');
    expect(getOverlapApiBaseUrl()).toBeNull();
  });
});
