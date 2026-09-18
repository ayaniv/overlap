# Tech design — Wire overlap to overlap-api's short-link service

## Summary

Short links are an addition to the hash links, not a replacement. The existing Share
button produces a path-based short URL (`https://overlapclock.com/abc123`) when it can,
and the current `#c=` hash URL when it can't. On load, the app calls `overlap-api`'s
`GET /links/:id` for a short-link path and falls back to the stored config, with a
toast, if the link is dead or the API is unreachable. `VITE_OVERLAP_API_URL` switches
the whole feature on. If it isn't set, the app behaves exactly as it does today. That
makes the change safe to merge before `overlap-api` is deployed. The short link is
created in the background as soon as the menu opens, so the uploaded snapshot never
includes meetings, and the privacy page changes in the same PR to say what is stored
and when. Turning the feature on in production is a separate, manual step with its own
checklist: the API's allowed origins must include `https://overlapclock.com`.

## Decisions a reviewer should look at first

1. **Supplement, not replace — and no second button.** Hash links stay valid forever:
   links already sent out can't break, and they are the fallback whenever the API
   isn't available. We don't add a separate "short link" button. The single Share
   button uses a short link when one is ready and the hash link otherwise. Users don't
   want to choose between two kinds of link. The hash link is still there as a
   fallback, and anyone who opens a short link ends up on a hash URL (see "Resolving").
   *Plan review verified the fallback triggers on every failure, not just "feature
   off".* These all end in `ok: false`, so Share returns the hash URL:
   - the variable is unset or blank: no request is made at all;
   - the variable is set, but the API is down, the host is unreachable, the URL is
     malformed, or CORS refuses the origin: the `fetch` rejects, giving `'network'`;
   - the API is slow: the call is still pending, or hits `'timeout'`;
   - the API returns a 4xx or 5xx, or a body that isn't valid.
   None of these touch the hash code path. Share reads `window.location.href` exactly
   as it does today.
2. **Share never waits on the network. The short link is created when the menu
   opens.** Share lives behind the hamburger menu (`ControlCluster`), so the POST
   fires when the menu is expanded in view mode. By the time Share is clicked, the
   short link is usually ready. If it isn't, Share uses the hash URL straight away.
   The reason: `navigator.share()` and `navigator.clipboard.writeText()` need
   *transient user activation*. Awaiting a `fetch` inside the click handler can use
   up that activation on Safari/iOS, and then the share sheet or clipboard write
   silently fails. Making the POST before the click avoids the problem instead of
   depending on each browser's activation-timeout rules. The cost is an orphaned
   `links` document when someone opens the menu and doesn't share. It's small, and a
   per-config cache makes it smaller (see "Creating").
3. **Meetings are removed before the POST.** A `Meeting` carries `googleEventId`,
   which is Google user data. `public/privacy.html` and the Google OAuth verification
   answers (`docs/GOOGLE_VERIFICATION.md`, `docs/GOOGLE_OAUTH_REPLY_DRAFT*.md`) promise
   that no Google user data reaches a developer-operated server. Short links therefore
   always send `meetings: []`. The cost is small: `App.tsx` already hides meetings
   from viewers of a shared link who haven't connected Google Calendar. Hash links
   keep today's behavior and still carry meetings, but only inside the URL.
   *Plan review confirmed this is deliberate, not an accidental loss.* A `Meeting` is
   `{ id, startISO, title, googleEventId? }`. The title and start time are the event
   details the privacy page lists as the Google user data the app handles. Uploading
   them would break the promise in decision 4's untouched Google sections. What a
   sender loses by switching from a hash link to a short link: a recipient who has
   connected Google Calendar no longer sees the sender's meeting dots. Cities, colors
   and working hours, which are what a share is for, arrive unchanged. Opening a short
   link replaces the recipient's own saved config, including their meetings, exactly
   as opening a hash link does today. That is not new behavior.
4. **The privacy copy must change in this PR.** `public/privacy.html` currently says
   "Nothing is collected or stored by the developer" and "There is no server that
   overlap's developer operates". `index.html` says "no backend". With short links
   on, a snapshot of the city list and working hours *is* stored on a server the
   developer runs. The dev stage updates both files (exact scope under "Changes").
   Pushing the new privacy text before the feature is switched on in production is
   fine. Switching the feature on while the old text says "no server" is not. **This
   is the one product call a reviewer should confirm explicitly.**
   *Plan review correction:* the upload happens **when the menu opens in view mode**,
   not when Share is clicked (decision 2). The privacy copy must say that. Copy that
   says "when you share" would under-state what is sent, because a user who opens the
   menu for any other action has already uploaded a snapshot. The copy must also cover
   retention: overlap-api has no TTL and no delete endpoint, so snapshots are kept
   indefinitely and the only way to remove one is to contact the developer.
5. **Deployment note (flagged, not blocking).** You've said `overlap-api` will go on
   Vercel. `overlap-api`'s own architecture doc argues against that for two reasons:
   serverless MongoDB connections need careful reuse across invocations, and there's
   cold-start latency. Neither blocks this task. The frontend only needs a base URL.
   Cold starts do hurt here, though: they lengthen the "Loading shared clock…" state
   and make it more likely that the menu-open POST hasn't finished when Share is
   clicked. `SHORT_LINK_REQUEST_TIMEOUT_MS` (below) limits the damage.
6. **CORS origins to set at deploy time (outside this repo).** The site's real
   production origin is `https://overlapclock.com` (`WEB_APP_ORIGIN` in
   `src/clock/webAppUrl.ts`, `index.html`'s canonical URL), but `overlap-api`'s
   `.env.example` lists only `http://localhost:5173` and `https://overlap.vercel.app`. Its deployed
   `FRONTEND_ORIGIN` must include `https://overlapclock.com`, plus
   `https://www.overlapclock.com` if that host serves the app instead of redirecting.
   Otherwise every short-link call from production is refused by CORS and shows up
   as `reason: 'network'`.
   *Plan review: this is now a required, written step, not just a note.* The code
   can't detect a wrong origin list. A CORS refusal is indistinguishable from "API
   down", and both fall back to hash links, so a misconfiguration would look like a
   working feature that never produces a short link. The dev stage therefore adds an
   **"Enabling short links in production" checklist** to `README.md` (see "Changes").
   Setting `VITE_OVERLAP_API_URL` in Vercel's Production environment is the switch,
   and the checklist must be completed before flipping it:
   - overlap-api's `FRONTEND_ORIGIN` lists `https://overlapclock.com` **first**. Order
     matters: `slack.routes.ts` redirects to the *first* entry after Slack OAuth, and
     `.env.example`'s order puts `http://localhost:5173` first. Add
     `https://www.overlapclock.com` if that host serves the app.
   - The updated `privacy.html` from this PR is live.
   - One real share and one real open from `https://overlapclock.com` succeed (the
     "Share" and "Open" smoke checks in Manual QA), and the browser console shows no
     CORS error.
   Vercel **preview** deployments have per-deploy origins that won't be in
   `FRONTEND_ORIGIN`. On a preview with the variable set, short links fall back to
   hash links, which is expected. No test in this plan hard-codes a production
   origin. The short URL is built from `window.location.origin`, and the tests assert
   against jsdom's origin, so they pass whatever the deployed origin is.

## Exploration findings (what this plan is built on)

Verified against `origin/main` at `e7a0e58` (overlap) and `5219877` (overlap-api).

**How sharing works today.** The flow is entirely client-side:
- `useClockConfig` (`src/hooks/useClockConfig.ts`) resolves the initial config in this
  order: `#c=` hash, then `localStorage` (`overlap:config:v1`), then `DEFAULT_CONFIG`.
  That's `resolveInitialConfig`. Every config change runs `persistConfig`, which writes
  localStorage and `history.replaceState(null, '', '#c=…')`. The URL is relative, so
  **the current pathname is kept**. After this change that matters: a page loaded at
  `/abc123` would keep `/abc123` in the URL for the whole session. See "Resolving"
  for how that's handled.
- `shareCodec.ts` handles `lz-string` encoding and decoding of the hash payload, plus
  `HASH_PREFIX = '#c='`.
- `App.tsx`: `getShareUrl = () => window.location.href` is passed to `useShareHandler`,
  which calls `shareLink()` (native share sheet, falling back to the clipboard), shows
  the toast from `SHARE_TOAST_MESSAGE`, and sends `analytics.trackEvent('clock_shared', { outcome })`.
- `extension/src/PopupApp.tsx` is the second caller of `useShareHandler`. Its share URL
  is `buildWebAppUrl(config)`, which is always a hash URL.
- `shared_config_loaded` fires only when the hash decoded **and** no valid stored config
  exists, meaning a first-time visitor.

**overlap has no backend integration today.** There is no `fetch` anywhere in `src/`,
no API client, and no routing. `vercel.json` is `{ framework: "vite" }` with no
rewrites. `import.meta.env.VITE_*` is already the config pattern
(`VITE_GOOGLE_CLIENT_ID`, `VITE_POSTHOG_*`), documented in `.env.example`.

**overlap-api's contract** (`src/links/links.routes.ts`, `src/app.ts`):
- `POST /links` takes a ClockConfig as the JSON body. It returns `200 { id }`, where
  `id` is `nanoid(10)` using the `[A-Za-z0-9_-]` alphabet. A body that fails validation
  gets `400 { error }`. A database error gets `500`. The validator is stricter than
  overlap's own `isValidClockConfig`: it requires 6-digit hex colors, integer
  `workStart` in [0,23], integer `workEnd` in [1,24], and `workStart < workEnd`.
  Configs overlap produces itself always pass. A 400 from the live API would point to
  drift between the two validators, and that is logged.
- `GET /links/:id` returns `200` with the config JSON directly (not wrapped), or `404`.
  Links never expire (the short-link spec puts TTL out of scope), so "dead/expired"
  always means `404`.
- CORS: the allowed origin list is `FRONTEND_ORIGIN`, comma-separated, read on every
  request. A disallowed origin gets no CORS headers, and the browser reports that as
  a `fetch` `TypeError`.

**Test infrastructure.** Vitest 4 with jsdom and @testing-library/react. There's **no
e2e/browser framework** (no Playwright or Cypress in `package.json`), and this plan
doesn't add one. The baseline `NODE_OPTIONS=--no-experimental-webstorage npm test`
passes 40 files / 523 tests at `e7a0e58` (Node 26 needs that flag so jsdom's
`localStorage` isn't shadowed, as in the previous task's VERIFY).

**Vite dev and preview already serve `index.html` for any path** (`appType: 'spa'`
history fallback, used for dot-free paths), so `http://localhost:5173/abc123` works
locally with no config change.

## Scope: one flat task, no milestones

The rewrite rule, API client, load-time resolution, Share wiring and privacy copy
all ship in one PR. None of them delivers anything useful on its own. Short links
without the rewrite rule return a 404 in production. Resolution without creation has
nothing to resolve. The environment-variable gate already covers what milestones
would give us here: the PR can merge before the API exists, and the feature turns on
later without a code change. The expected diff is about 5 new source files and small
edits to 6 existing ones.

## Changes

### New — `src/shortLinks/`

| File | Purpose |
| --- | --- |
| `overlapApiConfig.ts` | `getOverlapApiBaseUrl(): string \| null`. The **only** code that reads `import.meta.env.VITE_OVERLAP_API_URL`. It trims the value, strips a trailing `/`, and returns `null` for an empty value, which means short links are off. |
| `shortLinkApi.ts` | A pure API client. It takes `fetch` as an injected parameter and has no React or logger dependency. Contents listed below. |
| `useShortLinkPrefetch.ts` | `useShortLinkPrefetch(config, shouldPrefetch): () => string \| null`. Described under "Creating". |

`shortLinkApi.ts`:

```ts
export const SHORT_LINK_REQUEST_TIMEOUT_MS = 5000;
// single path segment, overlap-api's nanoid alphabet, no dots (so /privacy.html,
// /robots.txt etc. are never mistaken for ids); 64 max leaves room for the
// architecture doc's human-chosen `/my-name` slugs, not just nanoid(10)
const SHORT_LINK_PATH_PATTERN = /^\/([A-Za-z0-9_-]{1,64})\/?$/;

export type ShortLinkFailureReason =
  | 'not_found' | 'rejected' | 'server_error' | 'network' | 'timeout' | 'invalid_response' | 'aborted';
export type CreateShortLinkResult = { ok: true; id: string } | { ok: false; reason: ShortLinkFailureReason };
export type ResolveShortLinkResult = { ok: true; config: ClockConfig } | { ok: false; reason: ShortLinkFailureReason };

export function parseShortLinkId(pathname: string): string | null;
export function buildShortLinkUrl(origin: string, id: string): string;        // `${origin}/${id}`
export function createShortLink(baseUrl, config, fetchImpl = fetch, signal?): Promise<CreateShortLinkResult>;
export function resolveShortLink(baseUrl, id, fetchImpl = fetch, signal?): Promise<ResolveShortLinkResult>;
```

- Both requests use `AbortSignal.any([AbortSignal.timeout(SHORT_LINK_REQUEST_TIMEOUT_MS), signal])`,
  leaving out `signal` when it isn't given. Build the signal **inside** the same
  `try` as the `fetch`. `AbortSignal.any` needs Safari 17.4+ or Chrome 116+. On an
  older browser it throws a `TypeError`, which then maps to `'network'` (logged,
  hash fallback) instead of crashing the Share path or the loading state. A `TimeoutError` DOMException maps to
  `'timeout'`. An `AbortError`, which only happens when the caller cancels, maps to
  `'aborted'`. Any other rejection maps to `'network'`: offline, API down, or CORS
  refused. The browser deliberately makes those three indistinguishable.
- Status mapping: `404` → `not_found`, `400` → `rejected`, other non-2xx →
  `server_error`. For a 2xx, a JSON parse failure, a missing string `id`, or a body
  that fails **`isValidClockConfig`** gives `invalid_response`. The server's JSON is
  untrusted input, just like a hash payload.
- `createShortLink` sends `{ home, rings, meetings: [] }` (decision 3).
- `resolveShortLink` encodes the id with `encodeURIComponent`.
- One pitfall: call `fetchImpl(url, init)` as a plain function. Never store it on an
  object and call it as `obj.fetchImpl(...)`, because browsers throw "Illegal
  invocation" when `fetch` runs with a non-window `this`.
- A `shared/` helper isn't needed. The two request functions share only
  `requestJson(fetchImpl, url, init, signal) → {ok, status, body} | {ok:false, reason}`.
  Extract that as a module-private function so the timeout/abort/network mapping lives
  in one place.

### Changed — `vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

This is the rule the architecture doc prescribes. Vercel checks the filesystem before
applying `rewrites`, so `/privacy.html`, `/robots.txt`, `/sitemap.xml`,
`/assets/*.js`, `/og-image.jpg` and the Google verification HTML are still served as
files. **Check this on the PR's Vercel preview deploy** (see Manual QA), because no
unit test can confirm it.

### Changed — `src/hooks/useClockConfig.ts` (resolving a short link on load)

The initial state now has three sources: hash, then a short-link path, then
storage/defaults.

- Compute `hashConfig = parseHashConfig(location.hash)` once. If it's set, the
  behavior is exactly today's: **the hash beats the path**, and no fetch happens.
- Otherwise, compute `pendingShortLinkId = getOverlapApiBaseUrl() ? parseShortLinkId(location.pathname) : null`.
  With the API off, a short-looking path is ignored and the app loads normally
  (logged with `console.warn`, following this hook's existing `console.*` style, since
  this hook has no logger; see below). There is no toast, because that config is the
  current production reality.
- The initial `config` is still `resolveInitialConfig(...)` (stored/default). It's
  only a placeholder while resolving, and it's never persisted.
- New state: `shortLinkStatus: 'idle' | 'resolving' | 'failed'`, starting at
  `'resolving'` when `pendingShortLinkId` is set, and `shortLinkFailure: ShortLinkFailureReason | null`.
  A resolved link goes back to `'idle'`. A typed union is used instead of a boolean
  pair, per the no-ambiguous-booleans rule.
- A `useEffect` runs `resolveShortLink(baseUrl, id, fetch, controller.signal)` and
  returns `() => controller.abort()` as its cleanup. That makes it StrictMode-safe:
  the first mount's request is aborted, and an `'aborted'` result is **ignored**, not
  reported. On success: `setConfig(resolved)`, status `'idle'`, and analytics (next
  bullet). On failure: status `'failed'` and `shortLinkFailure = reason`. The config
  stays stored/default.
- The `shared_config_loaded` rule ("the shared config loaded and no valid stored
  config existed") is pulled into one helper that both sources use. The payload gets
  a `source: 'hash' | 'short_link'` property, which is why the existing hash test
  assertion in `useClockConfig.test.tsx` changes in this plan.
- `persistConfig` is **skipped while `shortLinkStatus === 'resolving'`**. Otherwise
  the placeholder would overwrite the stored config's URL mirror and wipe out the
  `/abc123` path before the response arrives.
- `persistConfig` drops the path **only when the page was loaded at a
  short-link-shaped path**. At mount, compute
  `shouldResetPath = parseShortLinkId(location.pathname) !== null` once (a
  `useState` initializer or `useRef`, like `loadedFromShare`). This check does
  not depend on the env gate or on whether a hash was present. `persistConfig` then
  writes `\`${shouldResetPath ? '/' : ''}${HASH_PREFIX}${encoded}\``. After a short
  link resolves or fails, the address bar reads `/#c=…`. The session stays
  self-contained: reloading doesn't hit the API again, and the hash fallback share URL
  (`location.href`) is a clean hash link, not `/abc123#c=…`. The same applies to a hash
  link opened at a short-link path, and to a short-link path opened with the env unset.
  *Plan review correction:* the original plan always wrote an absolute `/#c=…`. That
  is wrong, because **`extension/src/PopupApp.tsx` runs this same hook** at
  `chrome-extension://<id>/popup.html`. An absolute root would move the popup's URL
  off `popup.html`, which breaks a reload or an "open in tab". `popup.html` contains a
  dot, so `parseShortLinkId` rejects it and the popup keeps today's relative
  `#c=` write. Two tests in `useClockConfig.test.tsx` pin this: the popup-path
  guard is green today and must stay green, and the path-drop test is red until
  implemented.
- Returns `isResolvingShortLink` and `shortLinkFailure` along with the existing
  values. **The hook stays logger-free.** Every existing `renderHook` wrapper provides
  only `AnalyticsProvider`, and `useLogger()` throws without its provider. The
  user-facing reaction (toast, logger, failure analytics) lives in `App`, which
  already owns `useToast` and `useLogger`.

### Changed — `src/App.tsx`

- **Loading state.** When `isResolvingShortLink` is true, return
  `<div data-testid="short-link-loading" …>Loading shared clock…</div>` *after* all
  hooks run (hooks can't be conditional), instead of `<WorldClock>`. This avoids a
  flash of the viewer's own clock before the sender's config replaces it. Style it
  with a small `ShortLinkLoading.module.css`, or reuse the existing typography/color
  tokens in `index.css`. It should be quiet: centered, muted, no spinner needed. The
  worst case is `SHORT_LINK_REQUEST_TIMEOUT_MS` (5 s).
- **Failure reaction.** A `useEffect` keyed on `shortLinkFailure`:
  - `showToast(SHORT_LINK_FAILURE_TOAST[reason])`. The map lives in a shared constant
    next to `SHARE_TOAST_MESSAGE`'s style: `not_found` → "That shared link wasn't
    found", and anything else → "Couldn't open that shared link".
  - `analytics.trackEvent('short_link_load_failed', { reason })`.
  - `not_found` → `logger.warn(...)`. It's an expected outcome (a mistyped or stale
    URL), not a bug. Every other reason → `logger.error(new Error(\`short link resolve failed: ${reason}\`), 'failed to resolve short link from the URL path')`.
    `LoggerService.error` requires the context string.
- **Share.** `const getReadyShortUrl = useShortLinkPrefetch(config, isMenuExpanded && mode === 'view')`.
  Then `getShareTarget = useCallback(() => { const shortUrl = getReadyShortUrl(); return shortUrl ? { url: shortUrl, linkType: 'short' } : { url: window.location.href, linkType: 'hash' }; }, [getReadyShortUrl])`.
  Prefetching only runs in `view` mode so that every city edit in the Config panel
  doesn't send a POST. Clicking Done returns to view with the menu still open, which
  triggers one POST for the final config.

### Creating — `src/shortLinks/useShortLinkPrefetch.ts`

- The cache key is `encodeConfig(shareableConfig)`, where `shareableConfig` is the
  config with meetings removed. `encodeConfig` is the existing codec, so the key is
  based on content, not object identity. Changing only meetings doesn't create a new
  link, which is correct because the POST body doesn't change either.
- The cache is a `useRef<Map<string, { status: 'pending' } | { status: 'ready'; url } | { status: 'failed' }>>`.
  It's a ref, not state, because Share reads it at click time and nothing needs to
  re-render when it changes.
- An effect on `[cacheKey, shouldPrefetch, baseUrl]`: if prefetch is on, the base
  URL is set, and the key isn't cached yet, it stores `pending`, calls
  `createShortLink`, and records the result as `ready` or `failed`. On `failed` it
  calls `logger.error(new Error(\`short link create failed: ${reason}\`), 'failed to create short link for Share')`.
  **A failed key isn't retried** while that key stays the same, so a down API isn't
  hit on every menu open. A new config, or a reload, gets a fresh attempt.
- The returned getter is `useCallback`'d on `cacheKey`. It returns the `ready` URL for
  the **current** key only, so Share can never hand out a link for an older config.
  The URL is `buildShortLinkUrl(window.location.origin, id)`, which works unchanged on
  localhost, preview, and production origins.
- There is no abort on unmount or key change. A late response still fills the cache
  for its own key, which is harmless and saves a POST if the user returns to that
  config.

### Changed — `src/clock/useShareHandler.ts` and `share.ts`

- `useShareHandler(getShareTarget: () => ShareTarget, showToast)`, where
  `ShareTarget = { url: string; linkType: ShareLinkType }` and `ShareLinkType = 'short' | 'hash'`
  are exported from `share.ts`. The handler calls `shareLink(..., target.url)` and
  tracks `clock_shared` with `{ outcome, link_type: target.linkType }`.
- `extension/src/PopupApp.tsx`: `getShareTarget = useCallback(() => ({ url: buildWebAppUrl(config), linkType: 'hash' }), [config])`.
  The popup keeps hash links for now (see Out of scope). Two existing assertions in
  `PopupApp.test.tsx` gain `link_type: 'hash'`, and those edits are committed with
  this plan.

### Changed — config and docs

- `.env.example`: add `VITE_OVERLAP_API_URL=` with a comment explaining it: it's the
  overlap-api base URL, `http://localhost:3000` for a local `npm run dev` in
  `../overlap-api`, and unset disables short links. Also note that overlap-api's
  `FRONTEND_ORIGIN` must include this app's origin.
- `README.md`: a short "Short links (optional backend)" section covering local setup
  (Mongo, overlap-api `.env`, `npm run dev` in both repos, `VITE_OVERLAP_API_URL`).
  It also includes the **"Enabling short links in production" checklist** from
  decision 6: `FRONTEND_ORIGIN` with `https://overlapclock.com` first, the new
  `privacy.html` live, and then setting `VITE_OVERLAP_API_URL` in Vercel Production
  and **redeploying**. `VITE_*` values are baked in at build time, so changing the
  variable does nothing until the next build. Finish with the two smoke checks. It
  also includes a one-line **rollback warning** (see Risks): once short links have
  been handed out, don't unset the variable or take the API down.
- `public/privacy.html`: bump "Last updated". The sentences below become false and
  must change. Every other sentence stays as written:
  - Intro: "a static, backend-free world clock… There is no server that overlap's
    developer operates or controls". Change this to say the app runs in your browser,
    and that overlap's own server is used for one thing only: storing short-link
    snapshots.
  - "What the app collects": "Nothing is collected or stored by the developer", and
    the Share bullet "it is never uploaded anywhere". Replace them with a "Short links"
    bullet stating: **when you open the menu**, the app uploads a snapshot of your
    city names/labels, time zones, colors and working hours, never meetings and never
    any Google data, to overlap's server, so Share can hand out a short link. Anyone
    with the link can open that snapshot. The old `#c=` links still carry the
    configuration inside the URL, and that includes meetings. Location labels are
    free text, so the copy says "names/labels", not just "cities".
  - "Data Transfer": "since the app has no backend of its own". Scope it: no **Google**
    user data ever reaches overlap's server.
  - "Data Retention & Deletion": "Since nothing is stored outside your own browser".
    Add that short-link snapshots are kept on overlap's server with no expiry, and
    that deleting one means contacting the developer (the existing Contact section).
    overlap-api has no TTL and no delete route, so the copy must not promise
    otherwise.
  - The Google sections ("Data Access/Use/Protection", including "no backend in the
    request path") stay **true as written**, because decision 3 keeps them true.
    That sentence describes the Google flow, not the whole app, so leave it alone.
  - Out of scope, flagged for the user: the existing "No analytics, tracking scripts,
    or cookies are used" bullet looks inaccurate already, because the app ships
    `posthog-js` behind `VITE_POSTHOG_*`. It predates this task, so don't fix it
    here. Raise it as a separate follow-up.
- `index.html`: in the meta description, `#seo-fallback`, and `<noscript>` copy, the
  "no backend" claim becomes "no signup / no account". Keep the edit minimal.

## Verifier

```
npm run lint && npm run build && NODE_OPTIONS=--no-experimental-webstorage npm test
```

- `npm run build` runs `tsc -b`, which type-checks the new modules and the changed
  `useShareHandler` signature across both callers.
- `NODE_OPTIONS=--no-experimental-webstorage` is a real requirement of the local
  toolchain, not a way of hiding a bug. Plan review checked it: local Node is v26
  (`package.json` `engines` says 24.x). Node 25+ ships its own global `localStorage`,
  which is `undefined` without `--localstorage-file`, and it shadows jsdom's. Without
  the flag, `useClockConfig.test.tsx` fails with `Cannot read properties of undefined
  (reading 'getItem')`. The flag is accepted on Node 24 as well, so it is harmless
  there.
- `npm run build:extension` isn't needed. The popup is covered by `tsc -b` plus
  `PopupApp.test.tsx`, and its bundle doesn't change in any way that test would miss.
- The opt-in live contract test is *not* part of VERIFY, because it needs MongoDB and
  a running overlap-api. QA runs it (see Manual QA).

## Tests (committed with this plan, currently red)

**QA Spec:** `src/shortLinks/shortLinkApi.test.ts`, `src/shortLinks/overlapApiConfig.test.ts`, `src/shortLinks/useShortLinkPrefetch.test.tsx`, `src/App.test.tsx` (the two new `App — … short link …` describe blocks), `src/vercelConfig.test.ts`, `src/hooks/useClockConfig.test.tsx` (the "URL mirror path" block) and `src/shortLinks/shortLinkApi.live.test.ts` (opt-in)

| File | Covers |
| --- | --- |
| `src/shortLinks/overlapApiConfig.test.ts` | env set, trailing slash stripped, unset or blank → `null` |
| `src/shortLinks/shortLinkApi.test.ts` | `parseShortLinkId` (nanoid id, slug, trailing slash, root, dotted static files, nested, too long); `buildShortLinkUrl`; `createShortLink` (POST shape and headers, **meetings removed**, 400/5xx/network/timeout/non-JSON/missing-id); `resolveShortLink` (GET URL, encoding, 404/5xx/network/timeout, **invalid config body rejected**, caller abort → `'aborted'`) |
| `src/shortLinks/useShortLinkPrefetch.test.tsx` | inert when off or when the env is unset; POST once prefetch turns on; `null` while pending; never returns a link for a stale config; one POST per content key; failure logged and not retried |
| `src/App.test.tsx` — "opening a path-based short link" | loading state → the resolved config renders; persists and rewrites the URL to `/#c=…`; **no persist while resolving**; `shared_config_loaded` with `source: 'short_link'`; 404 → stored config + toast + `warn` + `short_link_load_failed`; network → toast + `error`; invalid body rejected; hash beats path (no fetch); root path never fetches; env unset → path ignored |
| `src/App.test.tsx` — "Share creates a short link" | the menu opening triggers the POST (meetings removed); Share copies `${origin}/<id>` with `link_type: 'short'`; POST failure → hash URL + `logger.error`; **a pending POST never blocks Share**; re-opening the menu reuses the link; env unset → no POST, hash share |
| `src/vercelConfig.test.ts` | the rewrite rule exists and the `vite` framework preset is kept |
| `src/hooks/useClockConfig.test.tsx`, "URL mirror path" (added by plan review) | a non-short-link path (`/popup.html`, the extension popup) is kept and only the hash is rewritten. This guard is green today and must stay green. A hash link opened at `/abc123` drops the path to `/`, which is red until implemented. |
| `src/shortLinks/shortLinkApi.live.test.ts` | **Opt-in**, skipped unless `OVERLAP_API_LIVE_URL` is set. Round-trips the real client against a live overlap-api: create → resolve gives back the same config, an unknown id → `not_found`, and a 3-digit hex color → `rejected`. This is the only test that proves the two repos agree on the contract. |

Existing assertions changed by this plan (red until implemented):
`App.test.tsx` and `PopupApp.test.tsx` `clock_shared` now include `link_type: 'hash'`,
and `useClockConfig.test.tsx` `shared_config_loaded` now includes `source: 'hash'`.

Red at commit time: 8 files fail (4 of them at import time) and 18 tests fail. That
is the 17 from planning plus plan review's path-drop test. They fail for the expected
reasons: missing modules, missing `rewrites`, missing loading test id, analytics
payloads, and the path not being reset. Plan review re-ran the suite and confirmed
these numbers. The regression guards (hash beats path, root path, env-unset path, no
persist while resolving, popup path kept) pass today and must stay green. The live file fails only on its import
until `shortLinkApi.ts` exists, and after that it's skipped by default.

## Manual QA (needs a real browser and a real overlap-api)

QA runs the Vitest QA Spec above against the branch, and then the steps below.
1. Start MongoDB and overlap-api locally: in `../overlap-api`, `cp .env.example .env`,
   make sure `FRONTEND_ORIGIN` includes `http://localhost:5173`, then `npm run dev`.
   Run `OVERLAP_API_LIVE_URL=http://localhost:3000 npx vitest run src/shortLinks/shortLinkApi.live.test.ts`,
   which should pass 3 tests.
2. `VITE_OVERLAP_API_URL=http://localhost:3000 npm run dev`. Open the menu, click
   Share, and paste the clipboard contents. It should be `http://localhost:5173/<10 chars>`.
   Open it in a private window: you should see a brief loading state, then the
   sender's cities, and the URL should become `/#c=…`.
3. Open `http://localhost:5173/doesnotexist` and check for the "wasn't found" toast
   and your own clock. Stop overlap-api and reload a valid short link to check for
   the "Couldn't open" toast and a logged error.
4. With overlap-api stopped, open the menu and click Share. You should get a hash
   link with no delay.
5. On the PR's **Vercel preview deploy**: `/<any-id>` serves the app (not a Vercel
   404), and `/privacy.html`, `/robots.txt`, `/sitemap.xml` and `/og-image.jpg` still
   serve their files. Unless the preview has `VITE_OVERLAP_API_URL` pointed at a
   reachable API, the app on the preview ignores the path, which is expected.
6. **Enabling in production (later, when overlap-api is deployed; not part of this
   PR's QA).** Work through the README checklist. Then, on `https://overlapclock.com`:
   the **Share** check is to open the menu, click Share, and confirm the result is
   `https://overlapclock.com/<id>`, not a `#c=` link. The **Open** check is to open
   that link in a private window and confirm the sender's cities appear. Keep DevTools
   open for both and confirm there is no CORS error. A `#c=` link from Share with a
   `short link create failed: network` error logged almost always means
   `FRONTEND_ORIGIN` is wrong.

## Risks

- **Orphaned links.** Each menu-open with a new config writes one Mongo document,
  whether or not the user shares. The cache and the view-mode gate keep this small.
  If it matters later, the fix is on the API side (a TTL index, or a `sharedAt`
  timestamp set on the first GET). Not in scope here.
- **Validator drift between the repos.** overlap-api is stricter (see Exploration). A
  config overlap accepts but the API rejects falls back to a hash link and is logged
  as `'rejected'`, so users never see a failure. The live contract test catches
  deliberate drift.
- **The rewrite makes every unknown path an app page.** With the API configured, a
  typo'd path shows the "wasn't found" toast. Without it, the path is ignored. Nothing
  returns a real 404 any more. That's acceptable for a single-page app, and it's what
  the architecture doc prescribes.
- **Turning the feature off strands short links that were already sent.** With
  `VITE_OVERLAP_API_URL` unset, a short-link path is deliberately ignored, with no
  toast (see "Resolving"). That is right today, because no short links exist yet.
  After launch, though, unsetting the variable or retiring the API would quietly
  show every recipient their own clock instead. So after launch, a rollback means
  keeping `GET /links/:id` reachable and fixing forward, not unsetting the variable.
  The README checklist says so. If a real kill switch is ever needed, it's a
  follow-up: a "resolve-only" mode that stops creating links but still resolves
  them.
- **Link previews** (Slack/WhatsApp) show the generic app shell for short links. The
  architecture doc already accepts this ("What this doesn't solve").

## Out of scope

- The Chrome extension's Share button (it stays a hash link to `overlapclock.com`).
  It's a simple follow-up once the API is deployed: reuse `createShortLink` in the popup.
- Any change to overlap-api: TTL, rate limiting, and its own deploy target and
  `FRONTEND_ORIGIN` values (decisions 5 and 6).
- Auth/config sync (`/auth`, `/me/config`), geo, and Slack. overlap-api has them
  built, but this task is about links only.
