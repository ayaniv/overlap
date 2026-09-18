import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// path-based short links (/abc123) only work in production if Vercel serves the
// app shell for every path — see overlap-api's
// docs/architecture/frontend-backend-integration.md ("Serving the app shell")
describe('vercel.json', () => {
  const vercelConfig: unknown = JSON.parse(
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'vercel.json'), 'utf8'),
  );

  it('keeps the vite framework preset', () => {
    expect(vercelConfig).toMatchObject({ framework: 'vite' });
  });

  it('rewrites every path to /index.html so /<short-id> loads the client-rendered shell', () => {
    expect(vercelConfig).toMatchObject({ rewrites: [{ source: '/(.*)', destination: '/index.html' }] });
  });
});
