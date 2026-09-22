import { describe, expect, it } from 'vitest';
import { WEB_APP_PRIVACY_URL } from './webAppUrl';

describe('WEB_APP_PRIVACY_URL', () => {
  it('points at the clean-URL form now that Vercel serves /privacy without the .html extension', () => {
    expect(WEB_APP_PRIVACY_URL).toBe('https://overlapclock.com/privacy');
  });
});
