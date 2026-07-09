import { createContext } from 'react';
import type { ReactNode } from 'react';
import { analytics } from './analytics';
import type { AnalyticsService } from './AnalyticsService';

export const AnalyticsContext = createContext<AnalyticsService>(analytics);

export type AnalyticsProviderProps = {
  children: ReactNode;
  service?: AnalyticsService;
};

export function AnalyticsProvider({ children, service = analytics }: AnalyticsProviderProps) {
  return <AnalyticsContext.Provider value={service}>{children}</AnalyticsContext.Provider>;
}
