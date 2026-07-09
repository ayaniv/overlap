import { useContext } from 'react';
import { AnalyticsContext } from './AnalyticsContext';
import type { AnalyticsService } from './AnalyticsService';

export function useAnalytics(): AnalyticsService {
  return useContext(AnalyticsContext);
}
