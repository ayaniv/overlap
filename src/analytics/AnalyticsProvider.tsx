import type { ReactNode } from 'react';
import { analytics } from './analytics';
import { AnalyticsContext } from './AnalyticsContext';
import type { AnalyticsService } from './AnalyticsService';

export type AnalyticsProviderProps = {
  children: ReactNode;
  service?: AnalyticsService;
};

export function AnalyticsProvider({ children, service = analytics }: AnalyticsProviderProps) {
  return <AnalyticsContext.Provider value={service}>{children}</AnalyticsContext.Provider>;
}
