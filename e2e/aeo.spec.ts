import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// AI answer-engine crawlers fetch raw HTML/text and don't execute JS, so every
// assertion here runs against the shipped bytes — files are parsed with
// DOMParser, which never runs <script>s, i.e. exactly what a crawler sees.
// Set AEO_BASE_URL (e.g. a Vercel preview URL) to run the same checks against
// a live deployment instead of public/, which also exercises cleanUrls (/faq).

const SITE_ORIGIN = 'https://overlapclock.com';
const PUBLIC_DIR = resolve(import.meta.dirname, '../public');
const BASE_URL = process.env.AEO_BASE_URL?.replace(/\/$/, '');

// published path → its file under public/ (Vercel cleanUrls drops `.html`)
function publicFileFor(path: string): string {
  const trimmed = path.replace(/^\//, '');
  if (trimmed === '') return 'index.html';
  return trimmed.includes('.') ? trimmed : `${trimmed}.html`;
}

async function loadAsset(path: string): Promise<string> {
  if (BASE_URL) {
    const response = await fetch(`${BASE_URL}${path}`);
    if (!response.ok) throw new Error(`GET ${BASE_URL}${path} → ${response.status}`);
    return response.text();
  }
  return readFileSync(resolve(PUBLIC_DIR, publicFileFor(path)), 'utf8');
}

async function pathExistsOnSite(pathWithSuffix: string): Promise<boolean> {
  // a citable anchor (/faq#is-it-free) or a query string is the same page on disk
  const path = pathWithSuffix.replace(/[?#].*$/, '');
  // against a deploy, ask the deploy itself — a file on disk says nothing about
  // whether e.g. cleanUrls actually serves it there
  if (BASE_URL) return (await fetch(`${BASE_URL}${path}`, { method: 'HEAD' })).ok;
  // the app's own index.html lives at the repo root, not under public/
  if (path === '/') return existsSync(resolve(PUBLIC_DIR, '../index.html'));
  return existsSync(resolve(PUBLIC_DIR, publicFileFor(path)));
}

function normalizeWhitespace(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

type RobotsGroup = { userAgents: string[]; allows: string[]; disallows: string[] };

// minimal robots.txt grouping per RFC 9309: consecutive User-agent lines open
// a group, and the Allow/Disallow lines that follow belong to it
function parseRobots(robotsTxt: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;
  let lastWasUserAgent = false;
  for (const rawLine of robotsTxt.split('\n')) {
    const line = rawLine.replace(/#.*/, '').trim();
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const field = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasUserAgent) {
        current = { userAgents: [], allows: [], disallows: [] };
        groups.push(current);
      }
      current.userAgents.push(value.toLowerCase());
      lastWasUserAgent = true;
      continue;
    }
    lastWasUserAgent = false;
    if (!current) continue;
    if (field === 'allow') current.allows.push(value);
    if (field === 'disallow' && value !== '') current.disallows.push(value);
  }
  return groups;
}

// the crawlers that feed ChatGPT, Claude, Perplexity and Google's AI features —
// both the index-building bots and the on-demand fetchers used when answering
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
];

// stable anchors for the FAQ entries answer engines are expected to cite —
// asserted by id, never by question copy, so rewording an answer doesn't break QA
const REQUIRED_FAQ_IDS = [
  'free-timezone-overlap-tool',
  'find-overlapping-working-hours',
  'is-it-free',
  'share-timezone-view',
  'schedule-google-calendar',
  'data-privacy',
  'chrome-extension',
  'compare-world-clocks',
  'open-source',
];

const FAQ_URL = `${SITE_ORIGIN}/faq`;

describe('robots.txt — AI crawler access @pending', () => {
  let groups: RobotsGroup[];

  beforeAll(async () => {
    groups = parseRobots(await loadAsset('/robots.txt'));
  });

  it.each(AI_CRAWLERS)('gives %s its own group that allows the whole site', (crawler) => {
    const group = groups.find((candidate) => candidate.userAgents.includes(crawler.toLowerCase()));
    expect(group, `no User-agent: ${crawler} group`).toBeDefined();
    expect(group?.allows).toContain('/');
  });

  it.each(AI_CRAWLERS)('never disallows any path for %s', (crawler) => {
    const group = groups.find((candidate) => candidate.userAgents.includes(crawler.toLowerCase()));
    expect(group?.disallows ?? []).toEqual([]);
  });

  it('does not block the site root for the catch-all user agent', () => {
    const catchAll = groups.find((candidate) => candidate.userAgents.includes('*'));
    expect(catchAll?.disallows ?? []).not.toContain('/');
  });
});

describe('llms.txt — llmstxt.org summary @pending', () => {
  let llmsTxt: string;

  beforeAll(async () => {
    llmsTxt = await loadAsset('/llms.txt');
  });

  it('opens with the project name as H1 followed by a one-line blockquote summary', () => {
    const [firstLine, ...rest] = llmsTxt.split('\n');
    expect(firstLine).toBe('# Overlap Clock');
    const firstContentLine = rest.find((line) => line.trim() !== '');
    expect(firstContentLine?.startsWith('> ')).toBe(true);
  });

  it('lists the FAQ page as a markdown link inside an H2 section', () => {
    const sections = llmsTxt.split(/^## /m).slice(1);
    const sectionWithFaq = sections.find((section) => section.includes(`](${FAQ_URL})`));
    expect(sectionWithFaq, 'no H2 section links the FAQ').toBeDefined();
    expect(sectionWithFaq).toMatch(new RegExp(`^- \\[[^\\]]+\\]\\(${FAQ_URL}\\)`, 'm'));
  });

  it('uses only absolute https links', () => {
    const linkTargets = [...llmsTxt.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]);
    expect(linkTargets.length).toBeGreaterThan(0);
    for (const target of linkTargets) expect(target).toMatch(/^https:\/\//);
  });

  it('never links to an overlapclock.com page that does not exist', async () => {
    const siteUrls = [...llmsTxt.matchAll(/https:\/\/overlapclock\.com(\/[^\s)>]*)?/g)];
    for (const [url, path] of siteUrls) {
      expect(await pathExistsOnSite(path ?? '/'), `${url} has no page`).toBe(true);
    }
  });
});

describe('sitemap.xml — FAQ discoverability @pending', () => {
  let locs: string[];

  beforeAll(async () => {
    const sitemap = new DOMParser().parseFromString(await loadAsset('/sitemap.xml'), 'application/xml');
    expect(sitemap.querySelector('parsererror')).toBeNull();
    locs = [...sitemap.getElementsByTagName('loc')].map((loc) => normalizeWhitespace(loc.textContent));
  });

  it('lists the FAQ page at its clean URL', () => {
    expect(locs).toContain(FAQ_URL);
  });

  it('only lists overlapclock.com pages that exist', async () => {
    for (const loc of locs) {
      expect(loc.startsWith(SITE_ORIGIN), `${loc} is off-site`).toBe(true);
      expect(await pathExistsOnSite(new URL(loc).pathname), `${loc} has no page`).toBe(true);
    }
  });
});

describe('FAQ page — crawler view (no JS) @pending', () => {
  let faq: Document;
  let items: Element[];

  beforeAll(async () => {
    faq = parseHtml(await loadAsset('/faq'));
    items = [...faq.querySelectorAll('[data-testid="faq-item"]')];
  });

  it('renders every Q&A as static HTML with no script needed to see it', () => {
    expect(faq.querySelectorAll('script[src]')).toHaveLength(0);
    expect(items.length).toBeGreaterThanOrEqual(REQUIRED_FAQ_IDS.length);
  });

  it.each(REQUIRED_FAQ_IDS)('has a citable #%s entry with a non-empty question and answer', (id) => {
    const item = faq.getElementById(id);
    expect(item?.getAttribute('data-testid')).toBe('faq-item');
    const question = item?.querySelector('[data-testid="faq-question"]');
    expect(question?.tagName).toMatch(/^H[23]$/);
    expect(normalizeWhitespace(question?.textContent)).not.toBe('');
    expect(normalizeWhitespace(item?.querySelector('[data-testid="faq-answer"]')?.textContent)).not.toBe('');
  });

  it('gives every entry exactly one question and one answer', () => {
    for (const item of items) {
      expect(item.querySelectorAll('[data-testid="faq-question"]')).toHaveLength(1);
      expect(item.querySelectorAll('[data-testid="faq-answer"]')).toHaveLength(1);
      expect(item.id).not.toBe('');
    }
  });

  it('names Overlap Clock in every answer so a quoted answer stands on its own', () => {
    for (const item of items) {
      expect(item.querySelector('[data-testid="faq-answer"]')?.textContent, `#${item.id}`).toContain('Overlap Clock');
    }
  });

  it('is indexable, canonical at /faq, and has a title and description', () => {
    expect(faq.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(FAQ_URL);
    expect(normalizeWhitespace(faq.title)).not.toBe('');
    expect(normalizeWhitespace(faq.querySelector('meta[name="description"]')?.getAttribute('content'))).not.toBe('');
    expect(faq.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '').not.toMatch(/noindex/i);
  });

  it('links back to the clock itself', () => {
    expect(faq.querySelector('[data-testid="faq-home-link"]')?.getAttribute('href')).toBe('/');
  });
});

describe('FAQ page — FAQPage structured data @pending', () => {
  type FaqPageJsonLd = {
    '@context': string;
    '@type': string;
    mainEntity: { '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }[];
  };

  let faq: Document;
  let jsonLdBlocks: unknown[];

  beforeAll(async () => {
    faq = parseHtml(await loadAsset('/faq'));
    jsonLdBlocks = [...faq.querySelectorAll('script[type="application/ld+json"]')].map((script) =>
      JSON.parse(script.textContent ?? ''),
    );
  });

  function faqPageBlock(): FaqPageJsonLd {
    const matches = jsonLdBlocks.filter(
      (block): block is FaqPageJsonLd => (block as { '@type'?: unknown })['@type'] === 'FAQPage',
    );
    expect(matches).toHaveLength(1);
    return matches[0];
  }

  it('declares exactly one schema.org FAQPage', () => {
    expect(faqPageBlock()['@context']).toBe('https://schema.org');
  });

  it('marks up every visible entry, in page order, and nothing that is not visible', () => {
    const visible = [...faq.querySelectorAll('[data-testid="faq-item"]')].map((item) => ({
      name: normalizeWhitespace(item.querySelector('[data-testid="faq-question"]')?.textContent),
      text: normalizeWhitespace(item.querySelector('[data-testid="faq-answer"]')?.textContent),
    }));
    const marked = faqPageBlock().mainEntity.map((question) => {
      expect(question['@type']).toBe('Question');
      expect(question.acceptedAnswer['@type']).toBe('Answer');
      return { name: normalizeWhitespace(question.name), text: normalizeWhitespace(question.acceptedAnswer.text) };
    });
    expect(marked).toEqual(visible);
  });
});
