import { createContext } from 'react';
import type { AnalyticsService } from './AnalyticsService';

// no real default: useAnalytics() throws when this is still undefined, so a
// render tree that forgets to wrap in <AnalyticsProvider> (most commonly a
// test rendering a component in isolation) fails loudly instead of silently
// falling through to the real, unmocked posthog-js singleton
export const AnalyticsContext = createContext<AnalyticsService | undefined>(undefined);
