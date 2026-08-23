import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const extensionDir = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(extensionDir, 'manifest.json'), 'utf8')) as Record<string, unknown>;
const popupHtml = readFileSync(resolve(extensionDir, 'popup.html'), 'utf8');

// Everything here is a contract Chrome enforces at load/review time rather than
// something a render test can reach: getting one of these wrong means the
// extension either refuses to load or silently breaks under MV3's CSP, with no
// failing component test to show for it.
describe('extension manifest', () => {
  it('is a Manifest V3 extension with a name, version and description', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toEqual(expect.any(String));
    expect(manifest.version).toMatch(/^\d+(\.\d+){0,3}$/);
    expect(manifest.description).toEqual(expect.any(String));
  });

  it('opens popup.html from the toolbar action', () => {
    const action = manifest.action as { default_popup?: string; default_icon?: Record<string, string> };
    expect(action.default_popup).toBe('popup.html');
    expect(action.default_icon).toBeTruthy();
  });

  it('declares the icon sizes the Chrome Web Store and toolbar need, and ships each file', () => {
    const icons = manifest.icons as Record<string, string>;
    for (const size of ['16', '48', '128']) {
      expect(icons[size]).toEqual(expect.any(String));
      // resolved against extension/public, which Vite copies to the bundle root
      // alongside the manifest — a manifest pointing at a missing icon is a
      // load-time failure in Chrome, not a runtime one
      expect(existsSync(resolve(extensionDir, 'public', icons[size]))).toBe(true);
    }
  });

  // The popup only ever needs to open a tab at overlapclock.com and POST
  // analytics; anything broader is a Web Store review risk for no gain.
  it('requests no permissions beyond what opening a tab needs', () => {
    const permissions = (manifest.permissions ?? []) as string[];
    expect(permissions).not.toContain('tabs');
    expect(permissions).not.toContain('<all_urls>');
    expect(permissions).not.toContain('storage');
  });

  it('limits host permissions to PostHog ingestion', () => {
    const hostPermissions = (manifest.host_permissions ?? []) as string[];
    expect(hostPermissions.length).toBeGreaterThan(0);
    for (const pattern of hostPermissions) {
      expect(pattern).toMatch(/^https:\/\//);
    }
    expect(hostPermissions.some((pattern) => pattern.includes('posthog.com'))).toBe(true);
  });

  // MV3 hard-blocks remotely hosted code. A relaxed CSP here would be rejected
  // by the Web Store, and any remote <script> in popup.html would silently fail
  // to execute in the real popup while still passing every jsdom test.
  it('never relaxes the extension-page CSP to allow remote or eval’d script', () => {
    const csp = manifest.content_security_policy as { extension_pages?: string } | undefined;
    const extensionPages = csp?.extension_pages;
    if (extensionPages === undefined) return;
    expect(extensionPages).toContain("script-src 'self'");
    expect(extensionPages).not.toContain('unsafe-eval');
    expect(extensionPages).not.toContain('unsafe-inline');
    expect(extensionPages).not.toMatch(/script-src[^;]*https?:\/\//);
  });
});

describe('extension popup entry point', () => {
  it('loads only same-origin scripts', () => {
    const scriptSources = [...popupHtml.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]);
    expect(scriptSources.length).toBeGreaterThan(0);
    for (const source of scriptSources) {
      expect(source).not.toMatch(/^https?:\/\//);
      expect(source).not.toMatch(/^\/\//);
    }
  });

  it('has no inline script, which the extension-page CSP blocks', () => {
    expect(popupHtml).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/);
  });
});
