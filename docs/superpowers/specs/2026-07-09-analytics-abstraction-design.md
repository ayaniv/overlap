# Analytics abstraction layer (`useAnalytics` / `AnalyticsProvider`)

## Problem

The PostHog integration wires `@posthog/react`'s `usePostHog()`/`PostHogProvider`
and `posthog-js`'s raw singleton directly into six source files
(`App.tsx`, `AddLocationForm.tsx`, `ManageLocationsList.tsx`,
`ScheduleForm.tsx`, `googleCalendar.ts`, `useClockConfig.ts`) plus `main.tsx`.
Every call site knows it's talking to PostHog specifically
(`posthog?.capture(...)`, `posthog?.captureException(...)`,
`posthog.capture(...)` for the non-React module). Swapping to a different
analytics vendor later (e.g. Mixpanel) would mean touching all seven files
again.

## Decisions locked during brainstorming

- **Interface is `trackEvent` + `captureException` only.** Nothing calls
  `identify`/`page`/anything else today — no speculative surface (YAGNI).
- **Non-React access via a singleton, not dependency injection.**
  `googleCalendar.ts` is a plain module, not a component. It imports the
  `analytics` singleton directly (mirrors the existing pattern of importing
  the raw `posthog-js` client). Full DI (passing a tracking callback into
  every `googleCalendar.ts` function) was rejected as more invasive for no
  real benefit here.
- **Drop `@posthog/react` entirely.** Its only value was `usePostHog()` +
  `PostHogProvider`, both replaced by our own hook/provider. Keeping it
  around would leave a second, redundant coupling point to PostHog.
  `postHogAdapter.ts` talks to `posthog-js` directly.
- **Lazy PostHog init, not eager at import time.** If `postHogAdapter.ts`
  called `posthog.init(...)` at module load (like `main.tsx` does today),
  then merely importing `useAnalytics` — which every migrated component
  does — would trigger PostHog init as an unconditional side effect,
  including in tests. Instead, init happens inside the adapter on first
  `trackEvent`/`captureException` call. Production behavior is unchanged
  (the first real event still initializes PostHog before sending); test
  behavior is unchanged (no init unless a test actually fires an event
  through the real adapter).
- **Context default value is the real singleton**, not `undefined`. This
  removes the `posthog?.` optional-chaining defensive pattern from every
  call site, and makes the value returned by `useAnalytics()` referentially
  stable across re-renders — which lets `useClockConfig.ts` drop its
  `useRef(posthog)` workaround (that ref existed solely to dodge
  `usePostHog()`'s instability).

## Architecture

New `src/analytics/` module:

```ts
// AnalyticsService.ts
export interface AnalyticsService {
  trackEvent(name: string, properties?: Record<string, unknown>): void;
  captureException(error: unknown): void;
}
```

```ts
// postHogAdapter.ts
import posthog from 'posthog-js';
import type { AnalyticsService } from './AnalyticsService';

let initialized = false;
function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  posthog.init(import.meta.env.VITE_POSTHOG_PROJECT_TOKEN, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,
    defaults: '2026-05-30',
  });
}

export const postHogAdapter: AnalyticsService = {
  trackEvent(name, properties) {
    ensureInitialized();
    posthog.capture(name, properties);
  },
  captureException(error) {
    ensureInitialized();
    posthog.captureException(error);
  },
};
```

```ts
// analytics.ts — the one line to change to swap providers
import { postHogAdapter } from './postHogAdapter';
import type { AnalyticsService } from './AnalyticsService';

export const analytics: AnalyticsService = postHogAdapter;
```

```tsx
// AnalyticsProvider.tsx
import { createContext, useContext, type ReactNode } from 'react';
import { analytics } from './analytics';
import type { AnalyticsService } from './AnalyticsService';

const AnalyticsContext = createContext<AnalyticsService>(analytics);

export function AnalyticsProvider({
  children,
  service = analytics,
}: {
  children: ReactNode;
  service?: AnalyticsService;
}) {
  return <AnalyticsContext.Provider value={service}>{children}</AnalyticsContext.Provider>;
}

export { AnalyticsContext };
```

```ts
// useAnalytics.ts
import { useContext } from 'react';
import { AnalyticsContext } from './AnalyticsProvider';
import type { AnalyticsService } from './AnalyticsService';

export function useAnalytics(): AnalyticsService {
  return useContext(AnalyticsContext);
}
```

To swap PostHog for another vendor later: write `mixpanelAdapter.ts`
implementing `AnalyticsService`, change `analytics.ts`'s one import/export
line. No other file changes.

## Call-site migration

Every event keeps its exact name and properties — this only changes *how*
it's fired:

- `ManageLocationsList.tsx`, `AddLocationForm.tsx`, `ScheduleForm.tsx`,
  `App.tsx`: `usePostHog()` → `useAnalytics()`; `posthog?.capture(name, props)`
  → `analytics.trackEvent(name, props)` (no `?.` needed anymore).
  `ScheduleForm.tsx`'s two `posthog?.captureException(err)` →
  `analytics.captureException(err)`.
- `useClockConfig.ts`: drop the `posthogRef`/`useRef` workaround; use
  `const analytics = useAnalytics()` directly, add `analytics` to the
  effect's dependency array (stable, safe).
- `googleCalendar.ts`: `import posthog from 'posthog-js'` →
  `import { analytics } from '../analytics/analytics'`;
  `posthog.capture('google_calendar_connected')` →
  `analytics.trackEvent('google_calendar_connected')`.

## Bootstrap changes

- `main.tsx`: remove `posthog.init(...)` and the `PostHogProvider` import;
  wrap `<App />` in `<AnalyticsProvider>` (no props — defaults to the real
  singleton).
- `package.json`: remove `@posthog/react`; keep `posthog-js` (now only
  imported by `postHogAdapter.ts`).

## Testing

New tests for the analytics module itself:

- `postHogAdapter.test.ts` — mocks `posthog-js`; asserts `trackEvent`/
  `captureException` delegate to `posthog.capture`/`posthog.captureException`,
  and that `posthog.init` fires on first use, not at import time.
- `AnalyticsProvider.test.tsx` — asserts `useAnalytics()` returns the default
  singleton with no provider present, and returns a custom `service` when
  passed via `<AnalyticsProvider service={...}>`.
- `mockAnalyticsService.ts` — shared test helper,
  `createMockAnalyticsService()` → `{ trackEvent: vi.fn(), captureException: vi.fn() }`,
  reused by the call-site tests below instead of each test file
  reimplementing the same mock.

Updated call-site tests (wrap with
`<AnalyticsProvider service={mockAnalyticsService}>`, assert exact event
name/properties on the relevant interaction):

- `AddLocationForm.test.tsx` → `location_added`
- `ManageLocationsList.test.tsx` → `location_removed`, `locations_reordered`
- `ScheduleForm.test.tsx` → `meeting_scheduled`, `meeting_deleted`, both
  `captureException` error paths
- `App.test.tsx` → `clock_shared`, `schedule_form_opened`
- `useClockConfig.test.ts` → `shared_config_loaded`
- `googleCalendar.test.ts` → `google_calendar_connected` — no Provider
  available (non-React module), so `vi.mock('../analytics/analytics')` to
  intercept the singleton directly.
