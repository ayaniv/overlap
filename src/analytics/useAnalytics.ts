import { useContext } from 'react';
import { AnalyticsContext } from './AnalyticsContext';
import type { AnalyticsService } from './AnalyticsService';

export function useAnalytics(): AnalyticsService {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalytics() must be called within an <AnalyticsProvider>');
  }
  return context.service;
}
