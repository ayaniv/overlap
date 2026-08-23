# Tech design — Overlap Clock Chrome extension

## Summary

Ship a Manifest V3 Chrome extension whose toolbar popup renders the **existing**
`WorldClock` at 380×600, backed by the existing `useClockConfig` persistence, with
a **Share** action that copies an `overlapclock.com` link and an **Open in Overlap**
action that hands the current config off to the full web app in a new tab.

The popup deliberately does *not* carry Google Calendar scheduling, time-scrubbing,
or Find overlap. Those aren't cut for effort — MV3's `script-src 'self'` blocks the
remote Google Identity Services script the scheduling flow depends on, and scrubbing
is that flow's only entry point. Handing off to the web app is how the popup covers
them honestly.

## Exploration findings (what this plan is built on)

Verified against `claude/overlap-chrome-extension` at `3a21480`.

**What is reusable as-is.** `WorldClock.tsx` is fully props-driven, renders pure SVG
from a 1000×1000 viewBox, and takes `now` from its parent. Everything it leans on is
pure and DOM-free: `geometry.ts`, `cityTime.ts`, `configOps.ts`, `configValidation.ts`,
`shareCodec.ts`, `defaultCities.ts`, `cityCatalog.ts`. `useClockConfig`, `useNow`,
`useIsPortrait`, `useToast`, `AddLocationForm`, `ManageLocationsList`,
`MobileConfigView` and `ControlCluster` all work unchanged in an extension page.

**Why 380×600, and why that's the whole layout story.** `.clockContainer` is
`width: min(86vmin, 700px)`, and every panel branch keys off
`matchMedia('(orientation: portrait)')` via `useIsPortrait`. A 380×600 popup *is*
portrait, so the popup automatically gets the phone layout the repo already ships
and already tests — `MobileConfigView` instead of the desktop `ConfigPanel`,
`AddLocationForm`'s immediate-add-on-pick, the portrait `ControlCluster` rules — and
a ~327px dial. **No new responsive CSS is needed**, only an explicit
`width`/`height` on the popup's `html`/`body`, because a popup window auto-sizes to
content and `index.css`'s `height: 100dvh` has nothing to resolve against.

**Why the popup can't just render `<App />`.** Three concrete blockers, each of
which is a design constraint rather than a preference:

1. `googleCalendar.ts` injects `<script src="https://accounts.google.com/gsi/client">`.
   MV3 hard-blocks remotely hosted code; the load rejects and `handleQuickSchedule`
   ends in an error toast every time. `App` wires `onQuickSchedule` unconditionally,
   so the button is present and always broken.
2. `WorldClock`'s footer links to `href="/privacy.html"`, which resolves to
   `chrome-extension://<id>/privacy.html` — a 404. The Chrome Web Store requires a
   working privacy-policy link.
3. `shareLink` copies `window.location.href`. In the popup that's a
   `chrome-extension://` URL, which is useless to whoever receives it.

`PopupApp` is therefore a *different composition* of the same parts, not a fork of
`App` — it reuses `useClockConfig`, `useNow`, `useToast`, `shareLink` and
`WorldClock` directly, and holds no logic copied from `App.tsx`.

**Analytics/logging — confirmed, and the one genuinely open question resolved.**
The `useAnalytics()` / `useLogger()` abstractions from PR #17 are present and are
plain React contexts whose providers already accept an injected `service` — exactly
the seam an extension needs, so they mount in a popup with no changes. What does
*not* survive the move is the default implementation: `posthog-js` lazy-loads its
feature bundles (recorder, surveys, exception autocapture) as remote `<script>` tags
from `api_host`, which MV3 blocks. So the extension keeps the abstraction and swaps
the transport — a small `fetch`-based PostHog capture adapter implementing both
`AnalyticsService` and `LoggerService`. No new abstraction is introduced.

**Test framework: Vitest, not Playwright.** There is no Playwright, no `e2e/`
directory and no browser-driver dependency anywhere in the repo (`docs/plan.md`
mentions Playwright only as *scratchpad* scripts an earlier agent ran ad hoc). The
only CI workflow is `update-changelog.yml`; it runs no tests. Adding a browser
driver to exercise one popup would be a larger change than the feature. Tests below
use the repo's real framework — Vitest + Testing Library — at integration level
(real `PopupApp`, real `useClockConfig`, real `WorldClock`, fakes only at the
`chrome.*`/`fetch`/`clipboard` boundary), plus a static contract test over
`manifest.json`/`popup.html` for the class of MV3 failures no render test can reach.

## Scope: one flat task, no milestones

The work is one PR's worth: build plumbing, one new component, one adapter, three
small shared-code edits. A split would have to be M0 "plumbing + read-only popup" →
M1 "config + share + handoff" → M2 "analytics" — but M1 and M2 both edit the same
`popup.tsx`/`PopupApp.tsx` surface M0 creates, so the split would buy serialization
and merge conflicts rather than independent progress. Flat.

## Changes

### New — `extension/`

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest (already committed with this plan; the contract test reads it) |
| `popup.html` | Vite entry (already committed with this plan) |
| `public/icons/icon{16,48,128}.png` | Toolbar/Web Store icons |
| `src/popup.tsx` | Mounts `PopupApp` inside `AnalyticsProvider`/`LoggerProvider` with the HTTP service |
| `src/PopupApp.tsx` | The popup composition |
| `src/popup.css` | Fixed 380×600 popup box |
| `src/httpPostHogService.ts` | MV3-safe `AnalyticsService & LoggerService` over `fetch` |
| `src/openWebApp.ts` | `chrome.tabs.create` wrapper that logs failures |

### Changed — shared app code (small, all driven by a real second call site)

- **`src/clock/webAppUrl.ts` (new).** `WEB_APP_ORIGIN`, `WEB_APP_PRIVACY_URL`, and
  `buildWebAppUrl(config)` = `${WEB_APP_ORIGIN}/#c=${encodeConfig(config)}`. One
  source of truth for the two places the popup needs a web-app URL (Share, Open in
  Overlap).
- **`src/clock/shareCodec.ts`.** Export the `#c=` prefix as `HASH_PREFIX`; it is
  currently a private constant in `useClockConfig.ts`, and `buildWebAppUrl` would be
  a second copy. `useClockConfig` imports it instead of declaring its own.
- **`src/clock/share.ts`.** Move `SHARE_TOAST_MESSAGE` here from `App.tsx` — the
  popup is the second call site, and the outcome→copy mapping must not fork.
- **`src/logger/consoleLogParts.ts` (new).** The `debug`/`info`/`warn` console trio
  currently inline in `postHogLogger.ts`, extracted so `postHogLogger` and
  `httpPostHogService` share one implementation. `postHogLogger` spreads it.
- **`src/clock/WorldClock.tsx`.** Three additions, all following the component's
  existing "an absent callback hides the control" convention (`onFindTime`):
  - `privacyHref?: string` (default `'/privacy.html'`) on the footer link, plus
    `data-testid="privacy-link"`.
  - `onOpenInWebApp?: () => void` — when present, renders an "Open in Overlap ↗"
    button in the existing `bottomLinks` row with `data-testid="open-in-web-app"`.
  - `data-testid={`ring-label-${id}`}` on each ring's label `<g>`, and
    `data-testid="center-local-label"` on the centre home-city label. Both are
    needed because the tests must not select by visible copy.
- **`package.json`.** Add `"build:extension": "tsc -b && vite build --config vite.config.extension.ts"` and devDependency `@types/chrome` (`0.2.7` on the registry).
- **`tsconfig.app.json`.** `include: ["src", "extension"]` and `types: ["vite/client", "chrome"]`, so the existing `npm run build` typechecks extension code too.
- **`vite.config.extension.ts` (new).** `root: 'extension'`, `publicDir: 'public'`, `build.outDir: '../dist-extension'`, `emptyOutDir: true`, react plugin.
- **`.gitignore`.** `dist-extension`.
- **`README.md`.** A "Chrome extension" section: `npm run build:extension`, then load `dist-extension/` unpacked via `chrome://extensions`.

### `PopupApp` wiring

```
config, addLocation, removeLocation, updateLocation, setHome, reorder  ← useClockConfig()
now                                                                     ← useNow()
mode, isMenuExpanded                                                    ← useState
isPortrait                                                              ← useIsPortrait()
toastMessage, showToast                                                 ← useToast()

onShare          → shareLink(navigator, navigator.clipboard, buildWebAppUrl(config))
                   → SHARE_TOAST_MESSAGE[outcome] toast
                   → analytics.trackEvent('clock_shared', { outcome })
onOpenInWebApp   → analytics.trackEvent('extension_open_web_app_clicked')
                   → openWebApp(config, logger)
privacyHref      → WEB_APP_PRIVACY_URL
modePanelContent → <AddLocationForm …/>  (same props as App's)
```

Not passed, and therefore not rendered: `scrubBind`, `onQuickSchedule`,
`onBackToNow`, `onFindTime`, `isGoogleCalendarConnected`, the scrub-hint props,
`isIdle`.

### `httpPostHogService`

```ts
export const EXTENSION_DISTINCT_ID_STORAGE_KEY = 'overlap:extension-distinct-id:v1';
export const CAPTURE_PATH = '/i/v0/e/';
export function createHttpPostHogService(fetchImpl?: typeof fetch): AnalyticsService & LoggerService;
```

- Reads `VITE_POSTHOG_PROJECT_TOKEN` / `VITE_POSTHOG_HOST` **at call time**, mirroring
  `posthogClient.ts`'s `getPostHogConfig()`; when either is blank it warns once and
  every capture no-ops — same contract the web app already has.
- `trackEvent(name, properties)` POSTs `{ api_key, event, distinct_id, properties }`.
- `error(err, context)` POSTs an `$exception` event carrying `context` and the error's
  message/type, matching `postHogLogger.error`'s shape.
- `debug`/`info`/`warn` come from `consoleLogParts` — never the network.
- `distinct_id` is a `crypto.randomUUID()` persisted under the key above.
- Every capture is fire-and-forget with a `.catch` and a non-`ok` check, both logging
  to `console.error`. `console` is the floor here on purpose: this module *is* the
  logger's transport, so routing its own failures back through `useLogger()` would
  recurse.

### Config storage: `localStorage`, unchanged

`useClockConfig` is used exactly as-is. In an extension page `localStorage` is
per-extension and persists across popup opens, so the popup keeps its config with
zero new code. Its `history.replaceState('#c=…')` mirror is harmless — it writes to
the popup's own throwaway URL.

**Explicit non-goals for v1**, each of which is a real cost, not an oversight:
- *Reading the web app's config.* `overlapclock.com`'s `localStorage` is a different
  origin; reaching it needs a content script plus a host permission on the site.
- *`chrome.storage.sync`.* Cross-device config would be genuinely nice, but its API
  is async while `useClockConfig` is synchronous throughout — it needs a parallel
  hook or a storage-adapter refactor of app code.
- *Seeding from the active tab* (`activeTab` + reading `tab.url` when it is an
  `overlapclock.com` `#c=` link). The cheapest of the three, and the recommended
  first follow-up, but it adds a permission and a subtle "only when nothing is
  stored yet" rule.

Consequence to be honest about: config flows **outward** (popup → web app, via Share
and Open in Overlap) but not inward. A first popup open shows the same
`DEFAULT_CONFIG` the web app shows to a first-time visitor.

### Fonts

`popup.html` keeps the same Google Fonts `<link>` as `index.html`. MV3's default CSP
restricts `script-src`/`object-src` only, so a remote stylesheet and its font files
load fine, and the popup matches the web app exactly. Offline, it falls back through
the existing `'Space Grotesk', -apple-system, sans-serif` stack. Self-hosting the two
woff2 files is a follow-up, not a blocker.

## Verifier

```
npm run lint && npm run build && NODE_OPTIONS=--no-experimental-webstorage npm test && npm run build:extension
```

Confirmed on this branch at `3a21480`: `lint`, `build` and `test` all exist and pass
— 37 files, 498 tests. `build:extension` is the one new segment, added by this task's
own diff, and is placed last so a failure there is unambiguous.

**Flagged, pre-existing, and deliberately not fixed here.** Without
`NODE_OPTIONS=--no-experimental-webstorage`, `npm test` fails **110 tests across 7
files** on this machine with `Cannot read properties of undefined (reading 'getItem')`.
Cause: the repo pins Node `24.18.0` (`.nvmrc`, `engines`) but the machine runs
`v26.5.0`, whose global `localStorage` shadows the one jsdom installs. It is not a
repo defect and it is unrelated to this feature, so it stays out of the diff. The
clean repo-side fix, if the owner wants one, is a three-line Vitest `setupFiles` that
re-points `globalThis.localStorage` at `window.localStorage`; that should land as its
own change.

## Tests (committed with this plan, currently red)

`extension/src/PopupApp.test.tsx` — integration, real component tree:
1. First open with no stored config renders `DEFAULT_CONFIG` (home + all four rings).
2. A stored config renders instead of the defaults.
3. Removing a city persists: after unmount + remount (what re-opening the popup
   actually does), the city is gone and the others remain.
4. Share copies exactly `https://overlapclock.com/#c=<encodeConfig(config)>` — asserted
   against the real codec, and asserted *not* to be a `chrome-extension://` URL —
   plus the `clock_shared`/`copied` event and a toast.
5. **Failure path:** a rejecting `clipboard.writeText` yields a toast and
   `clock_shared`/`failed`.
6. Open in Overlap calls `chrome.tabs.create` with `buildWebAppUrl(config)` and tracks
   `extension_open_web_app_clicked`.
7. **Failure path:** a rejecting `chrome.tabs.create` reaches `logger.error` with a
   context string.
8. The privacy link points at `WEB_APP_PRIVACY_URL`, not a relative path.
9. No scrub slider, no schedule button, no remove-meeting button.
10. No Find overlap button.

`extension/src/httpPostHogService.test.ts` — transport, happy and failure:
1. `trackEvent` POSTs to `${host}/i/v0/e/` with the token, event name, properties and
   a non-empty `distinct_id`.
2. The `distinct_id` is generated once and reused across events *and* across service
   instances, persisted under the documented key.
3. `error()` captures `$exception` carrying the context and the error message.
4. `warn()` goes to the console, never the network.
5. **Failure path:** unconfigured env → no `fetch` at all, exactly one warning.
6. **Failure path:** a rejected `fetch` is logged and never throws at the call site.
7. **Failure path:** a non-`ok` response (429) is logged.

`extension/manifest.test.ts` — MV3 contract, the failures jsdom cannot see:
1. Manifest V3 with name, semver-ish version, description.
2. The toolbar action opens `popup.html` and has a default icon.
3. `icons` declares 16/48/128 **and each file exists** under `extension/public/`.
4. No `tabs`, `<all_urls>` or `storage` permission.
5. `host_permissions` are HTTPS-only and scoped to PostHog ingestion.
6. If an `extension_pages` CSP is declared it keeps `script-src 'self'` and admits
   neither `unsafe-eval`, `unsafe-inline`, nor a remote script origin.
7. `popup.html` loads only same-origin scripts.
8. `popup.html` has no inline script.

Currently: `manifest.test.ts` passes 7/8 (red on the missing icon files);
`PopupApp.test.tsx` and `httpPostHogService.test.ts` fail to resolve their
not-yet-written modules. That is the intended red starting state.

Icons are producible with tooling already on the machine (verified):

```
for s in 16 48 128; do sips -z $s $s public/apple-touch-icon.png --out extension/public/icons/icon$s.png; done
```

## Manual QA (not automatable without a browser driver)

Load `dist-extension/` unpacked at `chrome://extensions` and confirm: the popup opens
at 380×600 with the dial legible and no scrollbars; the config sheet is
`MobileConfigView`, and adding a city adds it on pick; **the DevTools console for the
popup shows no CSP violation** (the single check that would catch a regression back to
`posthog-js`); Share pastes an `overlapclock.com` link that reproduces the popup's
cities; Open in Overlap lands on the web app with the same view; the Privacy link
opens the hosted policy.

## Risks

| Risk | Mitigation |
| --- | --- |
| A stray `posthog-js` import reaches the popup bundle and breaks under CSP | The manifest/CSP contract test plus the manual console check; `popup.tsx` injects the HTTP service explicitly rather than falling through to the default |
| `VITE_POSTHOG_HOST` is set to a self-hosted origin the manifest's `https://*.i.posthog.com/*` doesn't cover | Capture fails, `console.error` fires — observable, not silent; documented in the README section |
| Popup sizing drifts from portrait and silently swaps in the desktop `ConfigPanel` | `popup.css` pins 380×600; the tests pin `matchMedia` to portrait and assert the mobile surface |
| Users expect their web-app cities in the popup | Stated non-goal above; Open in Overlap covers the outward direction, and active-tab seeding is the named follow-up |
