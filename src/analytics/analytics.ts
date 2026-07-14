import { postHogAdapter } from './postHogAdapter';
import type { AnalyticsService } from './AnalyticsService';

// the one line to change to swap analytics providers — everything else in the app
// only ever imports `analytics` or calls `useAnalytics()`, never a vendor SDK directly
export const analytics: AnalyticsService = postHogAdapter;
