# Analytics Abstraction Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple every analytics call site in the `overlap` app from PostHog specifics by introducing a `useAnalytics()` hook / `AnalyticsProvider`, so swapping PostHog for another vendor later means writing one new adapter file and changing one line.

**Architecture:** A new `src/analytics/` module exposes a generic `AnalyticsService` interface (`trackEvent`, `captureException`). `postHogAdapter.ts` is the only file that imports `posthog-js`. `analytics.ts` is a singleton pointing at that adapter — non-React modules import it directly. `AnalyticsProvider`/`useAnalytics` expose the same singleton to components via React Context (with a real default value, so no provider is strictly required). All 6 existing call sites and `main.tsx` are migrated off `usePostHog`/`posthog-js` onto this layer, and `@posthog/react` is removed.

**Tech Stack:** React 19, TypeScript (`verbatimModuleSyntax: true` — use `import type` for type-only imports), Vite, Vitest, `@testing-library/react` v16 (`render`, `renderHook`, `cleanup`), `posthog-js`.

## Global Constraints

- `verbatimModuleSyntax` is on — every type-only import must use `import type { ... }`.
- No default `React` import needed anywhere (`jsx: "react-jsx"` transform) — only import the specific named exports/types used (`useContext`, `createContext`, `type ReactNode`, etc.).
- Match existing code style: no comments except where a non-obvious WHY needs explaining; relative import paths; plain `export function Foo(...)` components, no `React.FC`.
- Test files use `describe/it/expect/vi` imported explicitly from `'vitest'` (no test globals configured) and `afterEach(cleanup)` (or `afterEach(() => { cleanup(); ... })`) from `@testing-library/react`.
- Every intermediate task must leave `npx vitest run` and `npm run build` green — do not remove `@posthog/react` from `package.json` until every source file has stopped importing it (Task 9, after Tasks 3–8).
- Working branch: `analytics-abstraction-layer` (already checked out, based on the still-open `posthog-analytics-integration` branch). Commit after every task.

---

### Task 1: `AnalyticsService` interface + `postHogAdapter`

**Files:**
- Create: `src/analytics/AnalyticsService.ts`
- Create: `src/analytics/postHogAdapter.ts`
- Test: `src/analytics/postHogAdapter.test.ts`

**Interfaces:**
- Produces: `interface AnalyticsService { trackEvent(name: string, properties?: Record<string, unknown>): void; captureException(error: unknown): void; }` (in `AnalyticsService.ts`), and `export const postHogAdapter: AnalyticsService` (in `postHogAdapter.ts`) — later tasks import both.

- [ ] **Step 1: Create the interface**

`src/analytics/AnalyticsService.ts`:
```ts
export interface AnalyticsService {
  trackEvent(name: string, properties?: Record<string, unknown>): void;
  captureException(error: unknown): void;
}
```

- [ ] **Step 2: Write the failing test**

`src/analytics/postHogAdapter.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    captureException: vi.fn(),
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
});

// each case resets the module registry so postHogAdapter's private `initialized`
// flag and the posthog-js mock both start fresh — mirrors the pattern already used
// for loadGoogleIdentityServices's module-level cache in googleCalendar.test.ts
describe('postHogAdapter', () => {
  it('does not initialize PostHog just by being imported', async () => {
    vi.resetModules();
    const posthog = (await import('posthog-js')).default;
    await import('./postHogAdapter');

    expect(posthog.init).not.toHaveBeenCalled();
  });

  it('initializes PostHog exactly once, then delegates every call to posthog.capture', async () => {
    vi.resetModules();
    const posthog = (await import('posthog-js')).default;
    const { postHogAdapter } = await import('./postHogAdapter');

    postHogAdapter.trackEvent('location_added', { timezone_id: 'Asia/Tokyo' });
    postHogAdapter.trackEvent('location_removed');

    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.capture).toHaveBeenNthCalledWith(1, 'location_added', { timezone_id: 'Asia/Tokyo' });
    expect(posthog.capture).toHaveBeenNthCalledWith(2, 'location_removed', undefined);
  });

  it('delegates captureException to posthog.captureException', async () => {
    vi.resetModules();
    const posthog = (await import('posthog-js')).default;
    const { postHogAdapter } = await import('./postHogAdapter');
    const error = new Error('boom');

    postHogAdapter.captureException(error);

    expect(posthog.captureException).toHaveBeenCalledWith(error);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/analytics/postHogAdapter.test.ts`
Expected: FAIL — `Cannot find module './postHogAdapter'` (or similar resolution error), since the file doesn't exist yet.

- [ ] **Step 4: Write the implementation**

`src/analytics/postHogAdapter.ts`:
```ts
import posthog from 'posthog-js';
import type { AnalyticsService } from './AnalyticsService';

let initialized = false;

// deferred to first use (not import time) so importing the analytics module — which
// every migrated component will do via useAnalytics — never triggers PostHog init as
// a side effect in tests; production behavior is unchanged, since the first real
// event still initializes PostHog before sending
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

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/analytics/postHogAdapter.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/analytics/AnalyticsService.ts src/analytics/postHogAdapter.ts src/analytics/postHogAdapter.test.ts
git commit -m "feat: add AnalyticsService interface and PostHog adapter"
```

---

### Task 2: `analytics` singleton, `AnalyticsProvider`, `useAnalytics`, mock test helper

**Files:**
- Create: `src/analytics/analytics.ts`
- Create: `src/analytics/AnalyticsProvider.tsx`
- Create: `src/analytics/useAnalytics.ts`
- Create: `src/analytics/mockAnalyticsService.ts`
- Test: `src/analytics/AnalyticsProvider.test.tsx`

**Interfaces:**
- Consumes: `postHogAdapter: AnalyticsService` from `src/analytics/postHogAdapter.ts` (Task 1); `AnalyticsService` type from `src/analytics/AnalyticsService.ts` (Task 1).
- Produces: `export const analytics: AnalyticsService` (`analytics.ts`) — imported directly by non-React modules in later tasks; `export function AnalyticsProvider({ children, service? }: { children: ReactNode; service?: AnalyticsService })` and `export const AnalyticsContext` (`AnalyticsProvider.tsx`); `export function useAnalytics(): AnalyticsService` (`useAnalytics.ts`) — every migrated component calls this; `export function createMockAnalyticsService(): MockAnalyticsService` (`mockAnalyticsService.ts`) — every updated test file uses this.

- [ ] **Step 1: Create the singleton**

`src/analytics/analytics.ts`:
```ts
import { postHogAdapter } from './postHogAdapter';
import type { AnalyticsService } from './AnalyticsService';

// the one line to change to swap analytics providers — everything else in the app
// only ever imports `analytics` or calls `useAnalytics()`, never a vendor SDK directly
export const analytics: AnalyticsService = postHogAdapter;
```

- [ ] **Step 2: Create the provider**

`src/analytics/AnalyticsProvider.tsx`:
```tsx
import { createContext } from 'react';
import type { ReactNode } from 'react';
import { analytics } from './analytics';
import type { AnalyticsService } from './AnalyticsService';

export const AnalyticsContext = createContext<AnalyticsService>(analytics);

export type AnalyticsProviderProps = {
  children: ReactNode;
  service?: AnalyticsService;
};

export function AnalyticsProvider({ children, service = analytics }: AnalyticsProviderProps) {
  return <AnalyticsContext.Provider value={service}>{children}</AnalyticsContext.Provider>;
}
```

- [ ] **Step 3: Create the hook**

`src/analytics/useAnalytics.ts`:
```ts
import { useContext } from 'react';
import { AnalyticsContext } from './AnalyticsProvider';
import type { AnalyticsService } from './AnalyticsService';

export function useAnalytics(): AnalyticsService {
  return useContext(AnalyticsContext);
}
```

- [ ] **Step 4: Create the shared test mock**

`src/analytics/mockAnalyticsService.ts`:
```ts
import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { AnalyticsService } from './AnalyticsService';

export type MockAnalyticsService = AnalyticsService & {
  trackEvent: Mock;
  captureException: Mock;
};

export function createMockAnalyticsService(): MockAnalyticsService {
  return {
    trackEvent: vi.fn(),
    captureException: vi.fn(),
  };
}
```

- [ ] **Step 5: Write the test**

`src/analytics/AnalyticsProvider.test.tsx`:
```tsx
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AnalyticsProvider } from './AnalyticsProvider';
import { useAnalytics } from './useAnalytics';
import { analytics } from './analytics';
import { createMockAnalyticsService } from './mockAnalyticsService';

afterEach(cleanup);

describe('useAnalytics / AnalyticsProvider', () => {
  it('returns the real singleton when no provider is present', () => {
    const { result } = renderHook(() => useAnalytics());
    expect(result.current).toBe(analytics);
  });

  it('returns the real singleton by default when AnalyticsProvider has no service prop', () => {
    const { result } = renderHook(() => useAnalytics(), {
      wrapper: ({ children }) => <AnalyticsProvider>{children}</AnalyticsProvider>,
    });
    expect(result.current).toBe(analytics);
  });

  it('returns a custom service when one is passed to AnalyticsProvider', () => {
    const mockService = createMockAnalyticsService();
    const { result } = renderHook(() => useAnalytics(), {
      wrapper: ({ children }) => <AnalyticsProvider service={mockService}>{children}</AnalyticsProvider>,
    });
    expect(result.current).toBe(mockService);
  });
});
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run src/analytics/AnalyticsProvider.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add src/analytics/analytics.ts src/analytics/AnalyticsProvider.tsx src/analytics/useAnalytics.ts src/analytics/mockAnalyticsService.ts src/analytics/AnalyticsProvider.test.tsx
git commit -m "feat: add analytics singleton, AnalyticsProvider, useAnalytics, and test mock"
```

---

### Task 3: Migrate `googleCalendar.ts`

**Files:**
- Modify: `src/clock/googleCalendar.ts:1,41`
- Modify: `src/clock/googleCalendar.test.ts:1-20,71-76`

**Interfaces:**
- Consumes: `analytics: AnalyticsService` from `src/analytics/analytics.ts` (Task 2).

- [ ] **Step 1: Update the test first**

In `src/clock/googleCalendar.test.ts`, add a mock of the analytics singleton and import it, then assert on it in the existing "marks Google Calendar as connected" test.

Replace the top of the file (lines 1–20):
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analytics } from '../analytics/analytics';
import {
  buildEventPayload,
  createCalendarEvent,
  deleteCalendarEvent,
  deleteMeetingFromGoogleCalendar,
  getGoogleClientId,
  isGoogleCalendarConfigured,
  isGoogleCalendarConnected,
  requestAccessToken,
  scheduleMeetingOnGoogleCalendar,
} from './googleCalendar';
import type { GoogleOAuth2, TokenResponse } from './googleCalendar';

vi.mock('../analytics/analytics', () => ({
  analytics: { trackEvent: vi.fn(), captureException: vi.fn() },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(analytics.trackEvent).mockClear();
  window.localStorage.clear();
});
```

Replace the "marks Google Calendar as connected on a successful sign-in" test (currently lines 71–76):
```ts
  it('marks Google Calendar as connected on a successful sign-in', async () => {
    expect(isGoogleCalendarConnected()).toBe(false);
    const oauth2 = fakeOAuth2((callback) => callback({ access_token: 'tok-123' }));
    await requestAccessToken('client-id', oauth2);
    expect(isGoogleCalendarConnected()).toBe(true);
    expect(analytics.trackEvent).toHaveBeenCalledWith('google_calendar_connected');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/clock/googleCalendar.test.ts`
Expected: FAIL on the "marks Google Calendar as connected" test — `analytics.trackEvent` was not called (the source still calls `posthog.capture`, not the mocked `analytics`).

- [ ] **Step 3: Update the implementation**

In `src/clock/googleCalendar.ts`, replace line 1:
```ts
import { analytics } from '../analytics/analytics';
```

Replace line 41 (inside `markGoogleCalendarConnected`):
```ts
  analytics.trackEvent('google_calendar_connected');
```

- [ ] **Step 4: Run the full test file to verify it passes**

Run: `npx vitest run src/clock/googleCalendar.test.ts`
Expected: PASS (all tests, including the new assertion)

- [ ] **Step 5: Commit**

```bash
git add src/clock/googleCalendar.ts src/clock/googleCalendar.test.ts
git commit -m "refactor: migrate googleCalendar.ts to the analytics singleton"
```

---

### Task 4: Migrate `AddLocationForm.tsx`

**Files:**
- Modify: `src/clock/AddLocationForm.tsx:3,33,76`
- Modify: `src/clock/AddLocationForm.test.tsx:1-42`

**Interfaces:**
- Consumes: `useAnalytics(): AnalyticsService` from `src/analytics/useAnalytics.ts` (Task 2); `createMockAnalyticsService()` from `src/analytics/mockAnalyticsService.ts` (Task 2).

- [ ] **Step 1: Update the test first**

In `src/clock/AddLocationForm.test.tsx`, add imports and wrap only the first test's render with `AnalyticsProvider`, asserting the `location_added` event.

Replace the imports (lines 1–5):
```tsx
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsProvider } from '../analytics/AnalyticsProvider';
import { createMockAnalyticsService } from '../analytics/mockAnalyticsService';
import { AddLocationForm } from './AddLocationForm';
import { DEFAULT_WORK_END, DEFAULT_WORK_START, PALETTE } from './defaultCities';
```

Replace the first test (currently lines 15–42):
```tsx
  it('searches, selects a city, and adds a location with an unused default color and default work hours', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const analytics = createMockAnalyticsService();
    // every palette swatch but the last is already in use, so the suggested default is deterministic
    render(
      <AnalyticsProvider service={analytics}>
        <AddLocationForm
          existingIds={['tel-aviv']}
          existingColors={PALETTE.slice(0, PALETTE.length - 1)}
          onAdd={onAdd}
          onDone={vi.fn()}
        />
      </AnalyticsProvider>,
    );

    await pickTokyo(user);
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tokyo',
        label: 'Tokyo',
        timezoneId: 'Asia/Tokyo',
        color: PALETTE[PALETTE.length - 1],
        workStart: DEFAULT_WORK_START,
        workEnd: DEFAULT_WORK_END,
      }),
    );
    expect(analytics.trackEvent).toHaveBeenCalledWith('location_added', {
      timezone_id: 'Asia/Tokyo',
      country: 'Japan',
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/clock/AddLocationForm.test.tsx`
Expected: FAIL on the first test — `analytics.trackEvent` was not called.

- [ ] **Step 3: Update the implementation**

In `src/clock/AddLocationForm.tsx`, replace line 3:
```tsx
import { useAnalytics } from '../analytics/useAnalytics';
```

Replace line 33:
```tsx
  const analytics = useAnalytics();
```

Replace line 76:
```tsx
    analytics.trackEvent('location_added', {
```

- [ ] **Step 4: Run the full test file to verify it passes**

Run: `npx vitest run src/clock/AddLocationForm.test.tsx`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/clock/AddLocationForm.tsx src/clock/AddLocationForm.test.tsx
git commit -m "refactor: migrate AddLocationForm.tsx to useAnalytics"
```

---

### Task 5: Migrate `ManageLocationsList.tsx`

**Files:**
- Modify: `src/clock/ManageLocationsList.tsx:3,41,76,109`
- Modify: `src/clock/ManageLocationsList.test.tsx:1-4,84-93,73-82`

**Interfaces:**
- Consumes: `useAnalytics(): AnalyticsService` (Task 2); `createMockAnalyticsService()` (Task 2).

- [ ] **Step 1: Update the test first**

In `src/clock/ManageLocationsList.test.tsx`, add imports:

Replace the imports (lines 1–4):
```tsx
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsProvider } from '../analytics/AnalyticsProvider';
import { createMockAnalyticsService } from '../analytics/mockAnalyticsService';
import { ManageLocationsList } from './ManageLocationsList';
import type { Location } from './types';
```

Replace the "has no remove button..." test (currently lines 73–82):
```tsx
  it('has no remove button on the home row, and a working remove button on other rows', () => {
    const onRemove = vi.fn();
    const analytics = createMockAnalyticsService();
    render(
      <AnalyticsProvider service={analytics}>
        <ManageLocationsList locations={LOCATIONS} onReorder={vi.fn()} onRemove={onRemove} onClose={vi.fn()} />
      </AnalyticsProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Remove Tel Aviv' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove San Francisco' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('san-francisco');
    expect(analytics.trackEvent).toHaveBeenCalledWith('location_removed');
  });
```

Replace the "dragging a ring down past its outward neighbor swaps them..." test (currently lines 84–93):
```tsx
  it('dragging a ring down past its outward neighbor swaps them, keeping home in place', () => {
    const onReorder = vi.fn();
    const analytics = createMockAnalyticsService();
    render(
      <AnalyticsProvider service={analytics}>
        <ManageLocationsList locations={LOCATIONS} onReorder={onReorder} onRemove={vi.fn()} onClose={vi.fn()} />
      </AnalyticsProvider>,
    );

    // San Francisco (row 1) dragged past New York's (row 2) center
    drag(dragHandleFor('San Francisco'), rowCenter(1), rowCenter(2) + 1);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(['tel-aviv', 'new-york', 'san-francisco']);
    expect(analytics.trackEvent).toHaveBeenCalledWith('locations_reordered', { location_count: 3 });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/clock/ManageLocationsList.test.tsx`
Expected: FAIL on both updated tests — `analytics.trackEvent` was not called.

- [ ] **Step 3: Update the implementation**

In `src/clock/ManageLocationsList.tsx`, replace line 3:
```tsx
import { useAnalytics } from '../analytics/useAnalytics';
```

Replace line 41:
```tsx
  const analytics = useAnalytics();
```

Replace line 76:
```tsx
      posthog?.capture('locations_reordered', { location_count: liveOrder.length });
```
with:
```tsx
      analytics.trackEvent('locations_reordered', { location_count: liveOrder.length });
```

Replace line 109:
```tsx
                    posthog?.capture('location_removed');
```
with:
```tsx
                    analytics.trackEvent('location_removed');
```

- [ ] **Step 4: Run the full test file to verify it passes**

Run: `npx vitest run src/clock/ManageLocationsList.test.tsx`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/clock/ManageLocationsList.tsx src/clock/ManageLocationsList.test.tsx
git commit -m "refactor: migrate ManageLocationsList.tsx to useAnalytics"
```

---

### Task 6: Migrate `ScheduleForm.tsx`

**Files:**
- Modify: `src/clock/ScheduleForm.tsx:3,72,117,121,150,155`
- Modify: `src/clock/ScheduleForm.test.tsx:1-6,25-43,71-94,96-109,191-201,217-229`

**Interfaces:**
- Consumes: `useAnalytics(): AnalyticsService` (Task 2); `createMockAnalyticsService()` (Task 2).

- [ ] **Step 1: Update the test first**

In `src/clock/ScheduleForm.test.tsx`, add imports and update the shared `renderForm` helper to wrap with `AnalyticsProvider` and return the mock service, then add assertions to the four relevant tests.

Replace the imports (lines 1–6):
```tsx
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsProvider } from '../analytics/AnalyticsProvider';
import { createMockAnalyticsService } from '../analytics/mockAnalyticsService';
import { ScheduleForm } from './ScheduleForm';
import * as googleCalendar from './googleCalendar';
import { formatScheduledSummary } from './meetingForm';
```

Replace the `renderForm` helper (currently lines 25–43):
```tsx
function renderForm(overrides: Partial<Parameters<typeof ScheduleForm>[0]> = {}) {
  const onChangeInstant = vi.fn();
  const onScheduled = vi.fn();
  const onCancel = vi.fn();
  const onDeleteMeeting = vi.fn();
  const analytics = createMockAnalyticsService();
  render(
    <AnalyticsProvider service={analytics}>
      <ScheduleForm
        previewInstant={PREVIEW_INSTANT}
        onChangeInstant={onChangeInstant}
        existingMeetingIds={[]}
        onScheduled={onScheduled}
        onCancel={onCancel}
        isEnabled
        onDeleteMeeting={onDeleteMeeting}
        {...overrides}
      />
    </AnalyticsProvider>,
  );
  return { onChangeInstant, onScheduled, onCancel, onDeleteMeeting, analytics };
}
```

Replace the "schedules the meeting, reports success..." test (currently lines 71–94):
```tsx
  it('schedules the meeting, reports success, and hands the built meeting to onScheduled', async () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mockResolvedValue('evt-123');
    const user = userEvent.setup();
    const { onScheduled, analytics } = renderForm();

    await user.type(screen.getByLabelText('Meeting title'), 'Sync');
    await user.click(screen.getByRole('button', { name: 'Schedule' }));

    await waitFor(() => expect(onScheduled).toHaveBeenCalledTimes(1));
    expect(googleCalendar.scheduleMeetingOnGoogleCalendar).toHaveBeenCalledWith(
      'Sync',
      PREVIEW_INSTANT.toISOString(),
      googleCalendar.DEFAULT_MEETING_DURATION_MINUTES,
    );
    expect(onScheduled.mock.calls[0][0]).toMatchObject({
      title: 'Sync',
      startISO: PREVIEW_INSTANT.toISOString(),
      googleEventId: 'evt-123',
    });
    expect(screen.getByRole('status').textContent).toMatch(/added/i);
    // the date/time actually scheduled, not just a bare confirmation
    expect(screen.getByText(formatScheduledSummary(PREVIEW_INSTANT))).toBeTruthy();
    expect(analytics.trackEvent).toHaveBeenCalledWith('meeting_scheduled', {
      duration_minutes: googleCalendar.DEFAULT_MEETING_DURATION_MINUTES,
    });
  });
```

Replace the "shows an inline, retryable error when scheduling fails" test (currently lines 96–109):
```tsx
  it('shows an inline, retryable error when scheduling fails', async () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    const scheduleError = new Error('boom');
    vi.mocked(googleCalendar.scheduleMeetingOnGoogleCalendar).mockRejectedValue(scheduleError);
    const user = userEvent.setup();
    const { onScheduled, analytics } = renderForm();

    await user.type(screen.getByLabelText('Meeting title'), 'Sync');
    await user.click(screen.getByRole('button', { name: 'Schedule' }));

    expect((await screen.findByRole('alert')).textContent).toBe('boom');
    expect(onScheduled).not.toHaveBeenCalled();
    // still on the form, so the user can retry without re-entering the title
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeTruthy();
    expect(analytics.captureException).toHaveBeenCalledWith(scheduleError);
  });
```

Replace the "deletes via Google Calendar (re-signing in) then removes it locally..." test (currently lines 191–201):
```tsx
  it('deletes via Google Calendar (re-signing in) then removes it locally when the meeting has a googleEventId', async () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    vi.mocked(googleCalendar.deleteMeetingFromGoogleCalendar).mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { onDeleteMeeting, analytics } = renderForm({ matchedMeeting: MATCHED_MEETING });

    await user.click(screen.getByRole('button', { name: 'Delete meeting' }));

    await waitFor(() => expect(onDeleteMeeting).toHaveBeenCalledWith('m1'));
    expect(googleCalendar.deleteMeetingFromGoogleCalendar).toHaveBeenCalledWith('evt-1');
    expect(analytics.trackEvent).toHaveBeenCalledWith('meeting_deleted');
  });
```

Replace the "shows an inline error and does not remove the meeting when the Google Calendar delete fails" test (currently lines 217–229):
```tsx
  it('shows an inline error and does not remove the meeting when the Google Calendar delete fails', async () => {
    vi.mocked(googleCalendar.isGoogleCalendarConfigured).mockReturnValue(true);
    const deleteError = new Error('sign-in cancelled');
    vi.mocked(googleCalendar.deleteMeetingFromGoogleCalendar).mockRejectedValue(deleteError);
    const user = userEvent.setup();
    const { onDeleteMeeting, analytics } = renderForm({ matchedMeeting: MATCHED_MEETING });

    await user.click(screen.getByRole('button', { name: 'Delete meeting' }));

    expect((await screen.findByRole('alert')).textContent).toBe('sign-in cancelled');
    expect(onDeleteMeeting).not.toHaveBeenCalled();
    // still there, so the user can retry
    expect(screen.getByRole('button', { name: 'Delete meeting' })).toBeTruthy();
    expect(analytics.captureException).toHaveBeenCalledWith(deleteError);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/clock/ScheduleForm.test.tsx`
Expected: FAIL on the four updated tests — `analytics.trackEvent`/`captureException` were not called.

- [ ] **Step 3: Update the implementation**

In `src/clock/ScheduleForm.tsx`, replace line 3:
```tsx
import { useAnalytics } from '../analytics/useAnalytics';
```

Replace line 72:
```tsx
  const analytics = useAnalytics();
```

Replace line 117:
```tsx
      analytics.trackEvent('meeting_deleted');
```

Replace line 121:
```tsx
      analytics.captureException(err);
```

Replace line 150:
```tsx
      analytics.trackEvent('meeting_scheduled', { duration_minutes: durationMinutes });
```

Replace line 155:
```tsx
      analytics.captureException(err);
```

- [ ] **Step 4: Run the full test file to verify it passes**

Run: `npx vitest run src/clock/ScheduleForm.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/clock/ScheduleForm.tsx src/clock/ScheduleForm.test.tsx
git commit -m "refactor: migrate ScheduleForm.tsx to useAnalytics"
```

---

### Task 7: Migrate `useClockConfig.ts`

**Files:**
- Modify: `src/hooks/useClockConfig.ts:1,2,63-65,91-98`
- Rename + modify: `src/hooks/useClockConfig.test.ts` → `src/hooks/useClockConfig.test.tsx`

**Interfaces:**
- Consumes: `useAnalytics(): AnalyticsService` (Task 2); `AnalyticsProvider` (Task 2); `createMockAnalyticsService()` (Task 2).
- Produces: no change to `useClockConfig()`'s existing return shape (`{ config, setHome, addLocation, removeLocation, updateLocation, addMeeting, removeMeeting, reorder }`) — later tasks (App.tsx) are unaffected.

- [ ] **Step 1: Rename the test file and add the new test**

Rename the file (it now needs JSX for `<AnalyticsProvider>`):
```bash
git mv src/hooks/useClockConfig.test.ts src/hooks/useClockConfig.test.tsx
```

Replace the imports (currently lines 1–4):
```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsProvider } from '../analytics/AnalyticsProvider';
import { createMockAnalyticsService } from '../analytics/mockAnalyticsService';
import { encodeConfig } from '../clock/shareCodec';
import type { ClockConfig } from '../clock/types';
import { DEFAULT_CONFIG, parseHashConfig, parseStoredConfig, resolveInitialConfig, useClockConfig } from './useClockConfig';
```

Add a new describe block at the end of the file (after the existing `resolveInitialConfig` describe block):
```tsx
describe('useClockConfig — shared_config_loaded analytics event', () => {
  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('fires shared_config_loaded when the initial config was loaded from a share link', async () => {
    window.history.replaceState(null, '', `#c=${encodeConfig(SAMPLE_CONFIG)}`);
    const analytics = createMockAnalyticsService();

    renderHook(() => useClockConfig(), {
      wrapper: ({ children }) => <AnalyticsProvider service={analytics}>{children}</AnalyticsProvider>,
    });

    await waitFor(() =>
      expect(analytics.trackEvent).toHaveBeenCalledWith('shared_config_loaded', {
        location_count: SAMPLE_CONFIG.rings.length + 1,
        has_meetings: SAMPLE_CONFIG.meetings.length > 0,
      }),
    );
  });

  it('does not fire shared_config_loaded when there is no share link in the hash', () => {
    const analytics = createMockAnalyticsService();

    renderHook(() => useClockConfig(), {
      wrapper: ({ children }) => <AnalyticsProvider service={analytics}>{children}</AnalyticsProvider>,
    });

    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/useClockConfig.test.tsx`
Expected: FAIL on the new "fires shared_config_loaded..." test — `analytics.trackEvent` was not called (the source still uses `usePostHog`/`posthogRef`, which resolves to `undefined` with no `AnalyticsProvider`-aware wiring).

- [ ] **Step 3: Update the implementation**

In `src/hooks/useClockConfig.ts`, replace line 1:
```ts
import { useCallback, useEffect, useState } from 'react';
```

Replace line 2:
```ts
import { useAnalytics } from '../analytics/useAnalytics';
```

Replace lines 63–65:
```ts
  const analytics = useAnalytics();
```

Replace lines 91–98:
```ts
  useEffect(() => {
    if (loadedFromShare) {
      analytics.trackEvent('shared_config_loaded', {
        location_count: loadedFromShare.rings.length + 1,
        has_meetings: loadedFromShare.meetings.length > 0,
      });
    }
  }, [loadedFromShare, analytics]);
```

- [ ] **Step 4: Run the full test file to verify it passes**

Run: `npx vitest run src/hooks/useClockConfig.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useClockConfig.ts src/hooks/useClockConfig.test.tsx
git commit -m "refactor: migrate useClockConfig.ts to useAnalytics"
```

---

### Task 8: Migrate `App.tsx`

**Files:**
- Modify: `src/App.tsx:2,31,64,66,92,96`
- Modify: `src/App.test.tsx:1-6,39-43,79-133,148-197`

**Interfaces:**
- Consumes: `useAnalytics(): AnalyticsService` (Task 2); `AnalyticsProvider` (Task 2); `createMockAnalyticsService()` (Task 2).

- [ ] **Step 1: Update the test first**

In `src/App.test.tsx`, add imports, add a `renderApp` helper, replace every `render(<App />)` call with it, and add a new test for `clock_shared` plus an assertion for `schedule_form_opened`.

Replace the imports (currently lines 1–6):
```tsx
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsProvider } from './analytics/AnalyticsProvider';
import { createMockAnalyticsService } from './analytics/mockAnalyticsService';
import App from './App';
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from './hooks/useClockConfig';
import type { ClockConfig } from './clock/types';
```

Add `renderApp` right after the existing `openClusterMenu` helper (currently lines 39–43):
```tsx
function renderApp(service = createMockAnalyticsService()) {
  render(
    <AnalyticsProvider service={service}>
      <App />
    </AnalyticsProvider>,
  );
  return service;
}
```

Replace every `render(<App />);` call (7 occurrences, in the describe blocks starting at what are currently lines 45, 79, 139) with `renderApp();`, except the "auto-opens the schedule panel on the first scrub in landscape/desktop" test, which needs the returned service:

```tsx
  it('auto-opens the schedule panel on the first scrub in landscape/desktop', async () => {
    const user = userEvent.setup();
    const analytics = renderApp();

    await scrubForward(user);

    expect(screen.getByText('Schedule meeting')).toBeTruthy();
    expect(analytics.trackEvent).toHaveBeenCalledWith('schedule_form_opened');
  });
```

Add a new describe block for `clock_shared`, right after the "App — leaving schedule mode resets the scrub preview" describe block:
```tsx
describe('App — sharing fires an analytics event with the outcome', () => {
  it('fires clock_shared with the share outcome when the Share button is clicked', async () => {
    // jsdom implements neither navigator.share nor navigator.clipboard; stubbing
    // clipboard only (no .share) forces the deterministic "copied" fallback path
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const user = userEvent.setup();
    const analytics = renderApp();

    await openClusterMenu(user);
    await user.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('clock_shared', { outcome: 'copied' }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL on the new `clock_shared` test and the `schedule_form_opened` assertion — `App.tsx` still uses `usePostHog`.

- [ ] **Step 3: Update the implementation**

In `src/App.tsx`, replace line 2:
```tsx
import { useAnalytics } from './analytics/useAnalytics';
```

Replace line 31:
```tsx
  const analytics = useAnalytics();
```

Replace line 64:
```tsx
      analytics.trackEvent('clock_shared', { outcome });
```

Replace line 66:
```tsx
  }, [showToast, analytics]);
```

Replace line 92:
```tsx
        analytics.trackEvent('schedule_form_opened');
```

Replace line 96:
```tsx
    [mode, resetScrub, analytics],
```

- [ ] **Step 4: Run the full test file to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "refactor: migrate App.tsx to useAnalytics"
```

---

### Task 9: Bootstrap — `main.tsx` + drop `@posthog/react`

**Files:**
- Modify: `src/main.tsx` (full rewrite)
- Modify: `package.json:14` (remove `@posthog/react`)
- Modify: `package-lock.json` (via `npm install`)

**Interfaces:**
- Consumes: `AnalyticsProvider` from `src/analytics/AnalyticsProvider.tsx` (Task 2).

At this point (after Tasks 3–8), no source file under `src/` imports `@posthog/react` or `posthog-js` except `src/analytics/postHogAdapter.ts` — safe to remove the now-unused React binding.

- [ ] **Step 1: Verify no remaining `@posthog/react` imports outside the analytics module**

Run: `grep -rn "@posthog/react" src/`
Expected: no output.

- [ ] **Step 2: Rewrite `main.tsx`**

`src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AnalyticsProvider } from './analytics/AnalyticsProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AnalyticsProvider>
      <App />
    </AnalyticsProvider>
  </StrictMode>,
)
```

- [ ] **Step 3: Remove `@posthog/react` from `package.json`**

In `package.json`, delete the line `"@posthog/react": "^1.10.3",` from `dependencies` (keep `posthog-js`).

- [ ] **Step 4: Update the lockfile**

Run: `npm install`
Expected: exits 0; `package-lock.json` no longer lists `@posthog/react`.

- [ ] **Step 5: Verify the app still builds**

Run: `npm run build`
Expected: exits 0 (runs `tsc -b && vite build` — confirms no dangling `@posthog/react` type imports anywhere).

- [ ] **Step 6: Commit**

```bash
git add src/main.tsx package.json package-lock.json
git commit -m "refactor: wire AnalyticsProvider in main.tsx and drop @posthog/react"
```

---

### Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all test files pass, including every file touched in Tasks 1–9.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Run the linter**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 4: Confirm no remaining direct PostHog coupling outside the adapter**

Run: `grep -rln "posthog-js\|@posthog/react" src/ | grep -v src/analytics/postHogAdapter.ts`
Expected: no output — `posthog-js` is only imported by `src/analytics/postHogAdapter.ts`, and `@posthog/react` is imported nowhere.

- [ ] **Step 5: Push the branch**

```bash
git push -u origin analytics-abstraction-layer
```
