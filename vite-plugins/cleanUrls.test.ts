import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rewriteCleanUrl } from './cleanUrls.ts';

describe('rewriteCleanUrl', () => {
  let publicDir: string;

  beforeEach(() => {
    publicDir = mkdtempSync(join(tmpdir(), 'clean-urls-'));
    writeFileSync(join(publicDir, 'privacy.html'), '<!doctype html>');
    mkdirSync(join(publicDir, 'docs'));
    writeFileSync(join(publicDir, 'docs', 'guide.html'), '<!doctype html>');
    writeFileSync(join(publicDir, 'robots.txt'), '');
  });

  afterEach(() => {
    rmSync(publicDir, { recursive: true, force: true });
  });

  it('serves public/<name>.html at /<name>, like Vercel cleanUrls', () => {
    expect(rewriteCleanUrl(publicDir, '/privacy')).toBe('/privacy.html');
  });

  it('works for pages in subdirectories', () => {
    expect(rewriteCleanUrl(publicDir, '/docs/guide')).toBe('/docs/guide.html');
  });

  it('keeps the query string and hash', () => {
    expect(rewriteCleanUrl(publicDir, '/privacy?utm_source=x#top')).toBe('/privacy.html?utm_source=x#top');
  });

  it('leaves the root alone so the app keeps serving index.html', () => {
    expect(rewriteCleanUrl(publicDir, '/')).toBeNull();
  });

  it('leaves paths with no matching page alone, so they still reach the app', () => {
    expect(rewriteCleanUrl(publicDir, '/no-such-page')).toBeNull();
  });

  it('leaves paths that already carry an extension alone', () => {
    expect(rewriteCleanUrl(publicDir, '/privacy.html')).toBeNull();
    expect(rewriteCleanUrl(publicDir, '/robots.txt')).toBeNull();
  });

  it('never resolves outside the public directory', () => {
    writeFileSync(join(publicDir, '..', 'outside.html'), '<!doctype html>');
    try {
      expect(rewriteCleanUrl(publicDir, '/../outside')).toBeNull();
      expect(rewriteCleanUrl(publicDir, '/%2e%2e/outside')).toBeNull();
    } finally {
      rmSync(join(publicDir, '..', 'outside.html'), { force: true });
    }
  });

  it('treats a malformed URL as no match instead of throwing', () => {
    expect(rewriteCleanUrl(publicDir, '/%E0%A4%A')).toBeNull();
  });
});
