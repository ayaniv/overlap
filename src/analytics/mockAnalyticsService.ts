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
