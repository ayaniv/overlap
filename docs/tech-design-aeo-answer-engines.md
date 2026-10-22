# Tech design — AEO: get overlapclock.com surfaced by AI answer engines

## Summary

Make overlapclock.com something ChatGPT, Claude, Perplexity and Google's AI features can find, read and quote: a new static `/faq` page of self-contained Q&As with matching `FAQPage` structured data, the AI crawlers' current user agents allowed in `robots.txt`, and an `llms.txt` brought into the llmstxt.org shape with a link to the FAQ. It is one small flat unit of static files. The FAQ is a plain HTML page under `public/`, like `privacy.html`, so crawlers see it without JS, and it does **not** depend on the SEO task's prerender work.

**QA Spec:** `e2e/aeo.spec.ts`

Issue: https://github.com/ayaniv/overlap/issues/84 · companion: #83 (`overlap-seo-google`).

## Exploration findings (what this plan is built on)

Verified against `origin/main` at `8dfdd6e`.

- **Most of the issue's checklist already shipped in `575ca33`.** `public/robots.txt` already has
  `Allow: /` groups for GPTBot, ChatGPT-User, Google-Extended, ClaudeBot, Claude-Web, anthropic-ai,
  PerplexityBot, cohere-ai and Applebot-Extended. `public/llms.txt` already exists. So this task
  *closes the gaps*. It does not create these files from scratch.
- **robots.txt gaps:** the crawlers that actually feed *answers with citations* are missing:
  `OAI-SearchBot` (ChatGPT search's index, separate from GPTBot's training crawl), `Claude-SearchBot`,
  `Claude-User`, and `Perplexity-User`. `Claude-Web`/`anthropic-ai` are retired names. Leave them in,
  because they're harmless and removing them is churn.
- **llms.txt gap:** it's prose only. llmstxt.org expects `# Name`, a `> summary` blockquote, then
  `## Section`s holding `- [title](url): note` link lists. Today it has no markdown links at all, and
  no FAQ link (there's no FAQ yet).
- **No FAQ anywhere.** The home page's only crawler-visible text is the `#seo-fallback` / `<noscript>`
  block in `index.html`. The rest is a client-rendered React SPA.
- **Static pages are the established pattern.** `public/privacy.html` is a self-contained HTML page with
  an inline `<style>`, no JS, and dark-theme colors. `vercel.json` sets `cleanUrls: true` (#87), so
  `public/faq.html` is served at `/faq`, and `/faq.html` redirects there.
- **No e2e framework exists.** There's no Playwright and no `e2e/`. The only runner is vitest (jsdom env). Its
  default include glob already collects `e2e/**/*.spec.ts`, so the QA spec runs under `npm test` with
  no config change. That's the right tool here anyway: the thing under test is the raw shipped bytes a
  non-JS crawler fetches, not a browser interaction.
- **Analytics vs privacy copy mismatch (pre-existing, flagged — not fixed here):** `privacy.html:95`
  says "No analytics, tracking scripts, or cookies are used", but the web app ships PostHog
  (`src/posthog/posthogClient.ts`). The FAQ must not repeat that claim (see Open questions).
- **Test env:** the repo pins Node 24 (`.nvmrc`, `engines`). Under Node 26, 137 existing extension
  tests fail on `localStorage` (pre-existing, unrelated). Under Node 24 all 579 pass. So the verifier
  pins Node 24.

## Flat vs milestones

**Flat.** These are four static-file edits with no dependency between them, and each is a few minutes of
work. The FAQ content is the only real effort. Splitting would add ceremony without adding any shippable
increments.

## Design

### 1. `public/faq.html` — new static FAQ page (the core of the task)

- Same shell as `privacy.html`: the same inline dark-theme styles and fonts, no JS, and
  `<link rel="canonical" href="https://overlapclock.com/faq">`, a `<title>`, a `<meta name="description">`,
  and a "← Back to Overlap Clock" link (`data-testid="faq-home-link"`, `href="/"`).
  To avoid duplicating the stylesheet, note that the two pages share only a handful of base rules, and there is no build step
  for `public/`. Copying the base block matches the existing per-page pattern. If that feels wrong, the
  alternative is a shared `public/static-page.css` linked from both. **Dev's call. Don't do both.**
- Each Q&A is `<section id="<anchor>" data-testid="faq-item">` with an
  `<h2 data-testid="faq-question">` and one `<div data-testid="faq-answer">`. The ids are stable,
  citable anchors (`/faq#is-it-free`).
- **Answer-writing rules (this is what makes it AEO, not just FAQ):** the first sentence answers the
  question outright, and every answer names "Overlap Clock" so a quoted excerpt stands alone. Each answer is
  2–4 sentences and makes only claims true of the current code.
- Required entries (ids are asserted by the spec, but the question wording is the dev's):

  | id | question intent |
  |---|---|
  | `free-timezone-overlap-tool` | What's a good free tool to see time zone overlap with my team? |
  | `find-overlapping-working-hours` | How do I find overlapping working hours across time zones? |
  | `is-it-free` | Is it free / do I need an account? |
  | `share-timezone-view` | How do I share my time zone view with my team? |
  | `schedule-google-calendar` | Can I schedule a meeting in Google Calendar from it? |
  | `data-privacy` | Does it store or send my data? (see Open questions — must be accurate re: PostHog) |
  | `chrome-extension` | Is there a Chrome extension? (link the Web Store URL from `llms.txt`) |
  | `compare-world-clocks` | How is it different from a regular world clock / time zone converter? (no competitor names or claims about them) |
  | `open-source` | Is it open source? (MIT, GitHub link) |

- **`FAQPage` JSON-LD** goes in an inline `<script type="application/ld+json">` in the same file. Its
  `mainEntity` must list exactly the visible Q&As, in page order, with `acceptedAnswer.text` equal to
  the answer's plain text (links flattened to their text). Two copies of the same copy can drift apart,
  and there's no build step to derive one from the other, so the spec's parity test is the
  single-source-of-truth guard: it fails the moment the two differ.

### 2. `public/robots.txt` — add four AI crawler groups

Add `User-agent: OAI-SearchBot`, `Claude-SearchBot`, `Claude-User` and `Perplexity-User` groups, each with
`Allow: /`, in the existing AI block. Don't touch the `User-agent: *` group or the `Sitemap:` line, because those are SEO's.

### 3. `public/llms.txt` — reshape to llmstxt.org

Keep the existing H1, blockquote and prose (it's accurate). Add a `## Docs` section with link-list
entries: the FAQ (`https://overlapclock.com/faq`), the privacy policy, the GitHub repo and the Chrome Web Store
listing. Every link must be absolute `https://`, and every overlapclock.com link must resolve to a real page.
Both rules are spec-enforced. Correct the "Key facts" privacy bullet too, if the analytics answer
(Open questions) changes what's true.

### 4. `public/sitemap.xml` — add `/faq`

Add one `<url><loc>https://overlapclock.com/faq</loc>…</url>` entry.

### Not in scope

- No change to `index.html` or the React app. The home page's crawler copy, meta and `SoftwareApplication`
  structured data belong to #83. No in-app footer link to `/faq` either: the extension popup renders the
  same footer and would need its own absolute-URL override (like `privacyHref`). That's a separate
  UX change. Crawlers reach `/faq` via the sitemap and `llms.txt`.
- No `llms-full.txt`, because the site is one page and a FAQ, and `llms.txt` already covers it.

## Coordination with `overlap-seo-google` (#83)

Its tech-design didn't exist yet when this plan was written. Re-check
`/Users/yanivaharon/Dev/cockpit-ai/tasks/overlap-seo-google/tech-design.md` before opening the PR.

- **Shared files:** `public/robots.txt` (SEO owns `User-agent: *` and `Sitemap:`, and this task only *adds* the
  four AI groups) and `public/sitemap.xml` (SEO owns the file, and this task adds one `<url>`). Both are small
  additive hunks. Whichever PR merges second rebases, and the conflict is a trivial keep-both.
- **Not shared:** `index.html`, `src/**`. This task doesn't touch them.
- **No dependency on prerender:** `/faq` is static HTML, visible to non-JS crawlers on its own.
- **Ask of #83:** if its landing copy grows a FAQ section, it should *link to* `/faq` rather than
  duplicate the Q&As, and it should not add a second `FAQPage` JSON-LD to the home page. One FAQPage, one
  source.
- **In-repo doc path:** this doc lives in `docs/` rather than the repo root, because root `tech-design.md` is the
  Chrome extension's and both planning tabs writing it would collide.

## Verification

- **Verifier (VERIFY):** `npx -y node@24 ./node_modules/vitest/vitest.mjs run && npm run build`.
  This is the full unit suite plus `e2e/aeo.spec.ts` on the repo's pinned Node, then the typecheck and production build.
- **QA spec:** `e2e/aeo.spec.ts` (vitest, tagged `@pending` in each `describe`). By default it reads
  `public/`. Set `AEO_BASE_URL=https://<vercel-preview>` to run the same assertions against a live
  deploy, which also exercises `cleanUrls` (`/faq`) and the real served bytes.
  Run only it: `npx -y node@24 ./node_modules/vitest/vitest.mjs run e2e/`.
- **Red state at planning:** 7 failures for the right reasons (4 missing crawler groups, no FAQ link
  in `llms.txt`, no markdown links in `llms.txt`, no `/faq` in the sitemap). The two FAQ-page suites fail
  on `ENOENT public/faq.html`. During planning, the FAQ suites were confirmed to pass against a throwaway
  well-formed page, and to fail when one JSON-LD answer drifted from the visible text. The page was then deleted.
- `e2e/` is outside both tsc projects. After editing the spec, typecheck it with a temporary tsconfig that
  extends `tsconfig.app.json` with `"include": ["e2e"]` (done once at planning, and it was clean).
- **Manual post-deploy check:** validate `/faq` in Google's Rich Results Test (FAQPage detected, no
  errors).

## Open questions

1. **Analytics truthfulness.** The `data-privacy` answer can't honestly say "no analytics" while PostHog
   ships. Recommended: the FAQ answer says the app uses privacy-respecting product analytics (PostHog),
   with no account and no server-side storage of your clocks. Fixing `privacy.html:95` itself is a separate
   change. It should be filed, not bundled here.

## Manual developer checklist (not code — do after merge)

- [ ] Submit `/faq` in Google Search Console (URL inspection → request indexing) and Bing Webmaster
      Tools. Bing's index feeds ChatGPT search.
- [ ] Run Google's Rich Results Test on `https://overlapclock.com/faq`.
- [ ] Pitch inclusion on "best world clock apps" / "best tools for remote team scheduling" /
      "time zone tools for distributed teams" roundups (blog listicles, Zapier/remote-work blogs).
- [ ] List on AlternativeTo and SaaSHub (as an alternative to existing world-clock/timezone tools).
- [ ] Post genuine, non-link-drop write-ups where they're on-topic: r/remotework, r/digitalnomad,
      r/SideProject, r/InternetIsBeautiful. Answer real "how do I schedule across timezones" threads
      and disclose authorship. Follow each subreddit's self-promo rules.
- [ ] Every few weeks, ask ChatGPT/Perplexity/Claude "free tool to see timezone overlap with my team"
      and note whether overlapclock.com is cited. Cross-check AI referrers (chatgpt.com,
      perplexity.ai) in PostHog.
