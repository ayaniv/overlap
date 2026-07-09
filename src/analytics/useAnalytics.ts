import { useContext } from 'react';
import { AnalyticsContext } from './AnalyticsProvider';
import type { AnalyticsService } from './AnalyticsService';

export function useAnalytics(): AnalyticsService {
  return useContext(AnalyticsContext);
}
