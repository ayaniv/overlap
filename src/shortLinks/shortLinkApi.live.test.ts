import { describe, expect, it } from 'vitest';
import type { ClockConfig } from '../clock/types';
import { createShortLink, resolveShortLink } from './shortLinkApi';

// Opt-in contract test against a REAL, locally-running overlap-api
// (`npm run dev` in ../overlap-api, with MongoDB up). Skipped unless
// OVERLAP_API_LIVE_URL is set, so the default `npm test` never needs a
// backend. Run it with:
//   OVERLAP_API_LIVE_URL=http://localhost:3000 npx vitest run src/shortLinks/shortLinkApi.live.test.ts
const LIVE_API_URL = process.env.OVERLAP_API_LIVE_URL;

const SAMPLE_CONFIG: ClockConfig = {
  home: { id: 'tel-aviv', label: 'Tel Aviv', timezoneId: 'Asia/Jerusalem', color: '#38BDF8', workStart: 9, workEnd: 18 },
  rings: [{ id: 'london', label: 'London', timezoneId: 'Europe/London', color: '#FB7185', workStart: 9, workEnd: 24 }],
  meetings: [],
};

describe.skipIf(!LIVE_API_URL)('short-link client against a live overlap-api', () => {
  it('round-trips a config: createShortLink -> resolveShortLink returns the same config', async () => {
    const created = await createShortLink(LIVE_API_URL!, SAMPLE_CONFIG);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const resolved = await resolveShortLink(LIVE_API_URL!, created.id);
    expect(resolved).toEqual({ ok: true, config: SAMPLE_CONFIG });
  });

  it('reports not_found for an id the server has never issued', async () => {
    expect(await resolveShortLink(LIVE_API_URL!, 'does-not-exist-000')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('reports rejected for a payload overlap-api’s validator refuses (3-digit hex color)', async () => {
    const badConfig: ClockConfig = { ...SAMPLE_CONFIG, home: { ...SAMPLE_CONFIG.home, color: '#fff' } };
    expect(await createShortLink(LIVE_API_URL!, badConfig)).toEqual({ ok: false, reason: 'rejected' });
  });
});
