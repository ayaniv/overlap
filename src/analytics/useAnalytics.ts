import { useContext } from 'react';
import { AnalyticsContext } from './AnalyticsContext';
import type { AnalyticsService } from './AnalyticsService';

export function useAnalytics(): AnalyticsService {
  const service = useContext(AnalyticsContext);
  if (!service) {
    throw new Error('useAnalytics() must be called within an <AnalyticsProvider>');
  }
  return service;
}
