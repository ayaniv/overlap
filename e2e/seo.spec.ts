import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// Everything here is what a crawler sees *before* any JavaScript runs: the files
// Vite copies verbatim from public/ plus the index.html shell. A render test can't
// reach these, and getting one wrong fails silently — the page just never ranks.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(repoRoot, 'public');
const SITE_ORIGIN = 'https://overlapclock.com';
const MEETING_PLANNER_PATH = '/time-zone-meeting-planner';
const MEETING_PLANNER_FILE = resolve(publicDir, 'time-zone-meeting-planner.html');
const APP_ENTITY_ID = `${SITE_ORIGIN}/#app`;
// below this, the page is a stub rather than something worth indexing on its own
const MIN_LANDING_WORD_COUNT = 300;
// Google truncates descriptions past roughly this length in results
const MAX_DESCRIPTION_LENGTH = 160;
// Search Console ownership proofs, served from public/ but never meant to be indexed
const VERIFICATION_FILE_PATTERN = /^google[0-9a-f]+\.html$/;

type JsonLdNode = Record<string, unknown>;
type JsonLdDocument = JsonLdNode | { '@graph': JsonLdNode[] };

function readPublicFile(name: string): string {
  return readFileSync(resolve(publicDir, name), 'utf8');
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function metaContent(doc: Document, selector: string): string | null {
  return doc.querySelector(selector)?.getAttribute('content') ?? null;
}

function jsonLdNodes(doc: Document): JsonLdNode[] {
  return Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).flatMap((script): JsonLdNode[] => {
    const parsed = JSON.parse(script.textContent ?? '') as JsonLdDocument;
    return Array.isArray(parsed['@graph']) ? (parsed['@graph'] as JsonLdNode[]) : [parsed as JsonLdNode];
  });
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function sitemapLocs(): string[] {
  const sitemap = new DOMParser().parseFromString(readPublicFile('sitemap.xml'), 'application/xml');
  return Array.from(sitemap.getElementsByTagName('loc')).map((loc) => loc.textContent?.trim() ?? '');
}

// Vercel's cleanUrls serves public/<name>.html at /<name>, and / is the Vite index.html
function fileForSitemapPath(path: string): string {
  return path === '/' ? resolve(repoRoot, 'index.html') : resolve(publicDir, `${path.slice(1)}.html`);
}

describe('time-zone meeting planner landing page @pending', () => {
  let landing: Document;

  beforeAll(() => {
    landing = parseHtml(readFileSync(MEETING_PLANNER_FILE, 'utf8'));
  });

  it('is declared as English with a keyword title and a search-result-sized description', () => {
    expect(landing.documentElement.getAttribute('lang')).toBe('en');
    expect(landing.title).toMatch(/time zone/i);
    expect(landing.title).toContain('Overlap Clock');
    const description = metaContent(landing, 'meta[name="description"]') ?? '';
    expect(description.length).toBeGreaterThan(50);
    expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
  });

  it('canonicalises to its clean URL, not the .html file Vercel redirects away from', () => {
    const canonical = landing.querySelector('link[rel="canonical"]')?.getAttribute('href');
    expect(canonical).toBe(`${SITE_ORIGIN}${MEETING_PLANNER_PATH}`);
  });

  it('is not marked noindex', () => {
    const robots = metaContent(landing, 'meta[name="robots"]') ?? '';
    expect(robots).not.toMatch(/noindex/i);
  });

  it('carries real, visible copy under a single h1 rather than clipped crawler-only text', () => {
    expect(landing.querySelectorAll('h1')).toHaveLength(1);
    const content = landing.querySelector('[data-testid="landing-content"]');
    expect(content).not.toBeNull();
    expect(wordCount(content?.textContent ?? '')).toBeGreaterThanOrEqual(MIN_LANDING_WORD_COUNT);
    // the index.html fallback is visually clipped; Google discounts hidden text, so
    // this page's copy must be painted for real visitors
    expect(content?.closest('[id="seo-fallback"], [hidden], [style]')).toBeNull();
  });

  it('sends visitors on to the app itself', () => {
    const cta = landing.querySelector('[data-testid="landing-open-app"]');
    expect(cta?.getAttribute('href')).toBe('/');
  });

  it('describes itself for link previews, pointing og:url at the canonical URL', () => {
    expect(metaContent(landing, 'meta[property="og:title"]')).toBeTruthy();
    expect(metaContent(landing, 'meta[property="og:description"]')).toBeTruthy();
    expect(metaContent(landing, 'meta[property="og:url"]')).toBe(`${SITE_ORIGIN}${MEETING_PLANNER_PATH}`);
    expect(metaContent(landing, 'meta[property="og:image"]')).toMatch(/^https:\/\//);
  });

  it('declares itself a WebPage about the same app entity index.html defines', () => {
    const page = jsonLdNodes(landing).find((node) => node['@type'] === 'WebPage');
    expect(page).toBeDefined();
    expect(page?.url).toBe(`${SITE_ORIGIN}${MEETING_PLANNER_PATH}`);
    expect((page?.about as JsonLdNode | undefined)?.['@id']).toBe(APP_ENTITY_ID);
  });
});

describe('index.html crawler-facing shell @pending', () => {
  let shell: Document;

  beforeAll(() => {
    shell = parseHtml(readFileSync(resolve(repoRoot, 'index.html'), 'utf8'));
  });

  it('targets the time-zone search intent in its title, not just the contested "Overlap" brand', () => {
    expect(shell.title).toMatch(/time zone/i);
    expect(shell.title).toContain('Overlap Clock');
  });

  it('gives the WebApplication a stable @id and ties it to its other official homes', () => {
    const app = jsonLdNodes(shell).find((node) => node['@type'] === 'WebApplication');
    expect(app?.['@id']).toBe(APP_ENTITY_ID);
    expect(app?.sameAs).toEqual(
      expect.arrayContaining([
        'https://github.com/ayaniv/overlap',
        expect.stringMatching(/^https:\/\/chromewebstore\.google\.com\/detail\/overlap-clock\//),
      ]),
    );
  });

  // React replaces #root's children on mount, so this link only matters to the
  // HTML-only first crawl pass — which is exactly when link discovery happens
  it('links the landing page from the pre-JS fallback so the first crawl pass discovers it', () => {
    const link = shell.querySelector('#seo-fallback [data-testid="seo-fallback-meeting-planner-link"]');
    expect(link?.getAttribute('href')).toBe(MEETING_PLANNER_PATH);
  });
});

describe('sitemap.xml @pending', () => {
  it('lists only absolute, clean overlapclock.com URLs that resolve to a real page', () => {
    for (const loc of sitemapLocs()) {
      expect(loc.startsWith(`${SITE_ORIGIN}/`)).toBe(true);
      expect(loc).not.toMatch(/\.html$/);
      const path = loc.slice(SITE_ORIGIN.length);
      expect(existsSync(fileForSitemapPath(path)), `${loc} has no backing file`).toBe(true);
    }
  });

  it('lists every public HTML page except Search Console verification files', () => {
    const listedPaths = new Set(sitemapLocs().map((loc) => loc.slice(SITE_ORIGIN.length)));
    const pagePaths = readdirSync(publicDir)
      .filter((name) => name.endsWith('.html') && !VERIFICATION_FILE_PATTERN.test(name))
      .map((name) => `/${name.replace(/\.html$/, '')}`);
    expect(pagePaths).toContain(MEETING_PLANNER_PATH);
    for (const path of ['/', ...pagePaths]) {
      expect(listedPaths.has(path), `${path} missing from sitemap.xml`).toBe(true);
    }
  });

  it('has no duplicate entries', () => {
    const locs = sitemapLocs();
    expect(new Set(locs).size).toBe(locs.length);
  });
});

describe('robots.txt', () => {
  it('lets every crawler reach the site and points it at the sitemap', () => {
    const robots = readPublicFile('robots.txt');
    expect(robots).not.toMatch(/^Disallow:\s*\/\s*$/m);
    expect(robots).toMatch(new RegExp(`^Sitemap: ${SITE_ORIGIN}/sitemap\\.xml$`, 'm'));
  });
});

describe('static pages share one stylesheet @pending', () => {
  // privacy.html and the landing page used to be the only two hand-written pages;
  // a second copy of the same inline <style> block would drift on the first edit
  it.each(['privacy.html', 'time-zone-meeting-planner.html'])('%s links /static-page.css instead of inlining styles', (name) => {
    const doc = parseHtml(readPublicFile(name));
    expect(doc.querySelector('link[rel="stylesheet"][href="/static-page.css"]')).not.toBeNull();
    expect(doc.querySelector('style')).toBeNull();
  });

  it('ships the shared stylesheet itself', () => {
    expect(existsSync(resolve(publicDir, 'static-page.css'))).toBe(true);
  });
});
