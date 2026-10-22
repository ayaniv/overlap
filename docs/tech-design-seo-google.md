# Tech design — SEO: make overlapclock.com discoverable via Google

## Summary

overlapclock.com already has a title, a meta description, a canonical URL, OG tags, `WebApplication` JSON-LD, `robots.txt` and `sitemap.xml`, but it still doesn't rank, even for its own name. The reason is that Google indexes the *rendered* page, and on overlapclock.com that page is a full-viewport SVG clock with no copy and no links. The only descriptive text is a 60-word visually-clipped fallback that React wipes on mount. This task adds one real, static, keyword-targeted landing page (`/time-zone-meeting-planner`) in the same no-JS shape as `privacy.html`, links to it from the raw HTML and from the rendered app footer, retitles the home page toward the search intent, ties the two pages together in structured data, and completes the sitemap. The new page shares one stylesheet with `privacy.html` and the AEO companion's `/faq`, rather than becoming a third copy of the same styles. It is a single flat unit of static files plus one footer link.

## References

**QA Spec:** `e2e/seo.spec.ts`, `src/clock/WorldClock.test.tsx` and `extension/src/PopupApp.test.tsx` (the `@pending` cases)

Issue: https://github.com/ayaniv/overlap/issues/83 · companion: #84 (`overlap-aeo-answer-engines`, plan at `docs/tech-design-aeo-answer-engines.md` on its branch). AEO is implemented and open as **PR #92** (`680b9cf`), which is very likely to merge before this one. See "Shared files" below.

## Exploration findings (what this plan is built on)

Verified against `origin/main` at `8dfdd6e`, and against the live site on 2026-10-22.

- **Most of the issue's mechanical checklist already shipped** (`575ca33`, `d2e62ae`, `7aea2ae`, `424a8ff`). `index.html` has the title, description, canonical, OG/Twitter tags and `WebApplication` JSON-LD. `public/robots.txt` allows everything and names the sitemap. `public/sitemap.xml` exists. There's also a `#seo-fallback` block plus a `<noscript>`, and a Search Console verification file (`public/googleb61c446118f50a67.html`). So this task closes the gaps; it doesn't start from zero.
- **Live crawl check (as Googlebot UA):** `/`, `/robots.txt`, `/sitemap.xml`, `/privacy` and `/llms.txt` all return 200, and an unknown path returns a real 404 (no SPA catch-all, so no soft-404s). `http://` → 308 to https. **`www.overlapclock.com` → 307 (temporary)**, which should be permanent. That's a Vercel domain setting, not code; see the checklist.
- **Not indexed:** a web search for "overlapclock.com Overlap Clock world clock" returns nothing from the domain. It's dominated by Bonobo's iOS app *Overlap: World Clock*, so the bare brand "Overlap" is a contested query. The realistic organic wins are long-tail intent queries ("time zone meeting planner", "overlapping working hours across time zones"), which no page on the site currently targets.
- **Crawlability (the root cause).** `main.tsx` calls `createRoot(#root).render(...)`, which replaces `#root`'s children, so the `#seo-fallback` copy is gone from the rendered DOM that Google's render pass indexes. Before render, that copy is clipped to 1×1 (`#seo-fallback` CSS), and Google discounts hidden text. Prerendering/SSG the app itself is **not** worth it: it's a live clock driven by `Date.now()`, `matchMedia`, `localStorage` and the URL hash, so a prerendered snapshot would be wrong for every visitor and still carry no prose. The fix is a page that *is* prose, not a prerender of a page that isn't.
- **Static pages are the established pattern.** `public/privacy.html` is self-contained HTML with no JS and an inline `<style>`. `vercel.json` has `cleanUrls: true` (#87), so `public/<name>.html` is served at `/<name>`. Vite copies `public/` verbatim into `dist/` (confirmed by `npm run build`).
- **The app footer** (`WorldClock.tsx` ~L675) renders `GitHub • Privacy`, with `privacyHref` defaulting to `/privacy` and the extension popup overriding it with `WEB_APP_PRIVACY_URL` (`src/clock/webAppUrl.ts`), because a relative link 404s under `chrome-extension://`. A new footer link needs the same override.
- **Test framework:** Vitest (jsdom). There's no Playwright. Vitest's default include glob already collects `e2e/**/*.spec.ts`, and the AEO companion uses the same convention. Note that `e2e/` is outside both tsc projects (see Verification).
- **Test env:** the repo pins Node 24. Under the machine's Node 26, 137 existing tests fail on `localStorage` (Node's global Web Storage shadows jsdom's). This is pre-existing and unrelated. `NODE_OPTIONS=--no-experimental-webstorage` makes all 579 pass, the same workaround the extension task's verifier uses.

## Flat vs milestones

**Flat.** It's one static page, edits to a few static files, and a one-prop footer link, with no ordering dependency worth a separate PR. Every piece is small, and none ships value alone: the page without the links is undiscoverable, and the links without the page are 404s.

## Design

### 1. `public/time-zone-meeting-planner.html` — new landing page (the core)

- **Shell:** the same shape as `privacy.html`: no JS, `lang="en"`, `<title>Time Zone Meeting Planner — Overlap Clock</title>` (wording is the dev's, but it must contain "time zone" and "Overlap Clock"), a meta description ≤160 chars, `<link rel="canonical" href="https://overlapclock.com/time-zone-meeting-planner">` (clean URL, never `.html`), OG tags with `og:url` equal to the canonical and `og:image` pointing at the existing `https://overlapclock.com/og-image.jpg`, favicon links, and the shared stylesheet (§4).
- **Content:** `<main data-testid="landing-content">` with exactly one `<h1>` and **≥300 words of visible prose** (no clipping, `hidden` or inline `style`). Suggested sections (`<h2>`s):
  - what Overlap Clock is
  - how to find overlapping working hours across time zones, in 3–4 steps that match the real UI: add cities, read the colored working-hour arcs, drag the ring or use **Find overlap** to land on a shared slot, then schedule to Google Calendar
  - sharing a view by link
  - who it's for (distributed teams, freelancers with overseas clients)
  - free, open source (MIT), no account
  - the Chrome extension
  - a screenshot: `og-image.jpg` with descriptive `alt`

  Every claim must be true of the current code *and of the production deploy*. Scheduling only appears when `VITE_GOOGLE_CLIENT_ID` is set, so check it on live overlapclock.com. Keep the scheduling, data and Chrome-extension claims consistent with AEO's FAQ answers (`schedule-google-calendar`, `data-privacy`, `chrome-extension` in `public/faq.html` on #92): two pages on the same site that contradict each other is worse than either alone. Don't assert "no analytics" (PostHog ships; see AEO's open question 1). **No Q&A/FAQ section and no `FAQPage` JSON-LD:** that's AEO's `/faq`. If the copy wants one, it links to `/faq` once that exists.
- **CTA:** `<a data-testid="landing-open-app" href="/">`, prominent, near the top and again at the bottom.
- **Structured data:** one inline JSON-LD `WebPage` with `url` = canonical and `"about": {"@id": "https://overlapclock.com/#app"}`. That points at the home page's app entity (§2) instead of restating its name, offers and description, so the app has one definition rather than two that drift.

### 2. `index.html` — retitle, entity id, fallback link

- **Title:** `Overlap Clock — Time Zone Meeting Planner & World Clock` (or similar containing "time zone" and "Overlap Clock"). Update `og:title`/`twitter:title` to match. The current "World Clock at a Glance" targets nothing anyone searches for.
- **JSON-LD:** add `"@id": "https://overlapclock.com/#app"` and `"sameAs": ["https://github.com/ayaniv/overlap", "<CHROME_WEB_STORE_URL from src/clock/chromeExtension.ts>"]` to the existing `WebApplication`. `index.html` is static and can't import the TS constant, so the URL is a literal second copy. The spec pins its `chromewebstore.google.com/detail/overlap-clock/` prefix, so it can't drift silently. Don't add `aggregateRating`/`review`: Google's software rich result wants them, but there are none to cite, and fabricating them is a manual-action risk.
- **Fallback link:** inside `#seo-fallback`, add `<a data-testid="seo-fallback-meeting-planner-link" href="/time-zone-meeting-planner">…</a>`. React removes it on mount, but Google extracts links from the raw HTML on its first pass, which is when discovery happens. Mirror it in the `<noscript>` block (no testid needed).

### 3. App footer link — `WorldClock` + extension popup

- `src/clock/webAppUrl.ts`: add `MEETING_PLANNER_PATH = '/time-zone-meeting-planner'` and derive `WEB_APP_MEETING_PLANNER_URL = \`${WEB_APP_ORIGIN}${MEETING_PLANNER_PATH}\``, the same single-source pattern as `WEB_APP_PRIVACY_URL`.
- `WorldClock.tsx`: new optional `meetingPlannerHref` prop defaulting to `MEETING_PLANNER_PATH`. Render `<a data-testid="meeting-planner-link" target="_blank" rel="noreferrer">` in the bottom links (between GitHub and Privacy, with the existing `bottomLinkSeparator`), reusing `styles.privacyLink`. Label "How it works" is suggested anchor text; descriptive beats "About" for the link. New tab, like Privacy, so a kiosk/ambient clock never navigates away from itself.
- `extension/src/PopupApp.tsx`: pass `meetingPlannerHref={WEB_APP_MEETING_PLANNER_URL}` next to `privacyHref`.
- No analytics event: the Privacy and GitHub footer links don't track clicks either, and PostHog autocapture/pageviews already record arrivals on the landing page.

### 4. `public/static-page.css` — shared stylesheet

AEO's PR #92 already does this extraction: it adds `public/static-page.css`, which is `privacy.html`'s inline `<style>` moved verbatim (checked byte-for-byte, de-indented), and swaps `privacy.html`'s `<style>` for `<link rel="stylesheet" href="/static-page.css" />`. `faq.html` links the same file. **This task doesn't create a competing version.**

- **#92 merged when dev starts (expected):** rebase onto `main` and reuse the file as-is. The only change is to append the landing-only rules (CTA button, figure) at the end of `static-page.css` under their own classes. Don't touch the base rules or `privacy.html`. Two of the 9 planning reds (`privacy.html links /static-page.css`, `ships the shared stylesheet`) are then already green.
- **#92 not merged yet:** do the same extraction byte-identically to #92's version (move the `<style>` body verbatim, de-indented by 6 spaces, and use the exact same `<link … />` line in `privacy.html`). Append the landing-only rules strictly *after* the base rules. Whichever PR merges second then gets an add/add conflict on `static-page.css` that resolves to "base rules + landing rules", and a no-op on `privacy.html`.

Either way, the landing page links `/static-page.css` and has no `<style>` (the spec asserts both). Two hand-written pages each carrying the same ~55 lines would drift on the first edit.

### 5. `public/sitemap.xml` — complete it

Add `<url>` entries for `/time-zone-meeting-planner` and `/privacy` (currently missing). The spec enforces three rules from here on: every public `*.html` page except `google*.html` verification files must be listed, every `<loc>` must be an absolute clean URL backed by a real file, and there are no duplicates. Don't add `lastmod`: nothing keeps it honest, and a stale one is worse than none.

### 6. `public/robots.txt` — no change

The base `User-agent: *` / `Allow: /` / `Sitemap:` is already correct. `e2e/seo.spec.ts` has a regression guard for it (passes today, not `@pending`). The AI-crawler groups are AEO's.

### 7. `public/llms.txt` — one link, only if #92 has merged

AEO reshapes `llms.txt` into llmstxt.org form with a `## Docs` link list, and its spec fails on any overlapclock.com link without a real page. So AEO can't link the landing page, and this task can't edit a `## Docs` section that doesn't exist on `main` yet. The rule is that **whichever of the two PRs merges second** adds `- [Time zone meeting planner](https://overlapclock.com/time-zone-meeting-planner): what Overlap Clock does and how to find overlapping working hours` to `## Docs`. With #92 merged first, that's this PR. It's one line, and AEO's own spec checks that it resolves.

### Error handling / observability

Nothing here is fallible at runtime: the deliverables are static files and an `<a>`. There's no new I/O, fetch or storage, so there's nothing to log. Failures are caught at build and test time by the spec.

## Shared files with `overlap-aeo-answer-engines` (#84)

| File | This task | AEO | Collision |
|---|---|---|---|
| `public/sitemap.xml` | adds `/time-zone-meeting-planner`, `/privacy` | adds `/faq` (not `/privacy`) | adjacent additive hunks after the `/` entry. Second to merge keeps all three. Both specs read the same static file, so neither task introduces a generated sitemap. **Once `faq.html` is on `main`, this spec requires `/faq` in the sitemap**, which #92 adds. Merged together, both specs pass: every listed page exists and every page is listed. |
| `public/robots.txt` | no change | adds 4 AI groups | none |
| `public/static-page.css` | reuses #92's, appending landing-only rules (§4) | creates it (verbatim extraction) | If #92 merged first, none. Otherwise add/add, resolved as #92's base plus SEO's appended rules. |
| `public/privacy.html` | no change if #92 merged; otherwise the identical `<style>` → `<link>` swap | `<style>` → `<link>` swap | none, or an identical hunk. Neither task adds meta/OG to it. |
| `public/llms.txt` | adds the landing-page link to `## Docs` if it merges second (§7) | reshapes it, adds `## Docs` | second to merge adds the one line |
| `public/faq.html` | no change. It already links `/static-page.css` and has no inline `<style>`, so it isn't added to this spec's `it.each`. | creates it | none |
| `index.html` | edits title, JSON-LD, fallback | no change | none |
| `e2e/` | `e2e/seo.spec.ts` | `e2e/aeo.spec.ts` | none (separate files, same dir convention) |
| design doc | `docs/tech-design-seo-google.md` | `docs/tech-design-aeo-answer-engines.md` | none. The root `tech-design.md` (the Chrome extension's) is left alone by both. |

## Verification

- **Verifier (VERIFY):** `npm run lint && npm run build && ALLOW_NO_ANALYTICS=1 npm run build:extension && NODE_OPTIONS=--no-experimental-webstorage npm test`. That's lint, typecheck plus web build, extension build (the footer prop is consumed by `PopupApp`; `ALLOW_NO_ANALYTICS=1` because the extension build otherwise refuses without PostHog env), then the full suite including `e2e/seo.spec.ts`. Each segment was run on this branch.
- **Red state at planning (measured):** `9 failed | 582 passed | 7 skipped`. The 9 failures:
  - footer link missing in `WorldClock` and in the popup (2)
  - index title, `@id`/`sameAs`, fallback link (3)
  - sitemap is missing `/privacy` (1)
  - no `static-page.css` and `privacy.html` still inlines its styles (3)

  The 7 skipped are the landing-page suite, whose `beforeAll` fails on `ENOENT public/time-zone-meeting-planner.html`. As a sanity check, that suite went 7/7 green against a throwaway well-formed page, which was then deleted.
- **`e2e/` isn't typechecked by `npm run build`.** After editing the spec, typecheck it with a temporary `tsconfig` that extends `tsconfig.app.json` with `"include": ["e2e"]` (done at planning, and it's clean).
- **Red state re-measured at plan review** (`5b1a872`, Node 26 with the flag): identical, 9 failed, 582 passed, 7 skipped. Lint and both builds are clean.
- **Implementation order (TDD):** run the verifier first and confirm the 9 failures plus 7 skips above. After a rebase onto a `main` that has #92, expect 7 failures: the two stylesheet reds are already green, and AEO's `e2e/aeo.spec.ts` should be green too. Then work in this order: §4 stylesheet → §1 page → §5 sitemap → §2 index.html → §3 footer (write `webAppUrl` first, then the prop).
- **Manual QA on the Vercel preview:**
  - `curl -sI <preview>/time-zone-meeting-planner` → 200 `text/html`
  - `/time-zone-meeting-planner.html` → 308 to the clean URL
  - the footer link opens the page
  - the footer still fits on one line in the 380px-wide extension popup, now that it's `GitHub • How it works • Privacy • Open in Overlap ↗` (load the unpacked `dist-extension`). If it wraps, shorten the label rather than restyle the footer.
  - paste the page into Google's Rich Results Test → `WebPage` parsed with no errors, then the home URL → `WebApplication` parsed
  - the page renders legibly at phone width

## Open questions

1. **Home title change.** Moving from "World Clock at a Glance" to a "Time Zone Meeting Planner" framing changes the tab title and social-share title real users see. Recommended, because the brand query is lost to Bonobo, but it's the owner's call. If vetoed, drop the title case from the spec and keep the rest.
2. **Landing slug.** `/time-zone-meeting-planner` matches the highest-intent query. Renaming it later costs a redirect, so settle it before merge.

## Manual developer checklist (not code — do after merge)

- [ ] **Vercel → Domains:** change `www.overlapclock.com`'s redirect to `overlapclock.com` from 307 to **308 (permanent)**, so link equity consolidates.
- [ ] **Google Search Console:** the domain is already verified (`googleb61c446118f50a67.html`). Submit `https://overlapclock.com/sitemap.xml`, then use URL Inspection → *Request indexing* for `/` and `/time-zone-meeting-planner`. In URL Inspection, also check *View crawled page → Screenshot/HTML* for `/` to confirm what Google actually renders.
- [ ] **Bing Webmaster Tools:** import from Search Console and submit the sitemap. Bing's index also feeds ChatGPT search and DuckDuckGo.
- [ ] **Backlinks:** add the site URL to the GitHub repo's *About → Website* field and README header. Then:
  - launch on Product Hunt
  - post a Show HN with a link to the app, framed around the radial-clock idea
  - post on r/SideProject and r/InternetIsBeautiful, following each sub's self-promo rules
  - fill the Chrome Web Store listing's website field with `https://overlapclock.com`
  - list on AlternativeTo
- [ ] **Re-post the LinkedIn announcement** with a UTM-tagged link, since the original showed 0 tracked clicks: `?utm_source=linkedin`.
- [ ] **In 4–6 weeks:** check Search Console → Pages (indexed count) and Performance (impressions for "time zone" queries), and check organic referrers in PostHog against the Jul 19–30 baseline.
