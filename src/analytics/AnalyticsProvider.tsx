import { useMemo, type ReactNode } from 'react';
import { analytics } from './analytics';
import { AnalyticsContext } from './AnalyticsContext';
import type { AnalyticsService } from './AnalyticsService';

export type AnalyticsProviderProps = {
  children: ReactNode;
  service?: AnalyticsService;
};

export function AnalyticsProvider({ children, service = analytics }: AnalyticsProviderProps) {
  const contextValue = useMemo(() => ({ service }), [service]);

  return <AnalyticsContext.Provider value={contextValue}>{children}</AnalyticsContext.Provider>;
}
