import posthog from 'posthog-js';
import { ensurePostHogInitialized } from '../posthog/posthogClient';
import type { AnalyticsService } from './AnalyticsService';

export const postHogAdapter: AnalyticsService = {
  trackEvent(name, properties) {
    ensurePostHogInitialized();
    posthog.capture(name, properties);
  },
};
