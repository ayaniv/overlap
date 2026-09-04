import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { AnalyticsService } from './AnalyticsService';

interface AnalyticsContextValue {
  service: AnalyticsService;
}

// no real default: useAnalytics() throws when this is still undefined, so a
// render tree that forgets to wrap in <AnalyticsProvider> (most commonly a
// test rendering a component in isolation) fails loudly instead of silently
// falling through to the real, unmocked posthog-js singleton
const AnalyticsContext = createContext<AnalyticsContextValue | undefined>(undefined);

export type AnalyticsProviderProps = {
  children: ReactNode;
  // required, not defaulted: a static import of the real `analytics` singleton
  // here would pull posthog-js into every consumer's bundle (including the
  // extension popup, which can never load it under MV3's CSP) — see
  // tech-design.md's bundling measurement. The composition root (main.tsx)
  // is the only place that should name a vendor.
  service: AnalyticsService;
};

export function AnalyticsProvider({ children, service }: AnalyticsProviderProps) {
  const contextValue = useMemo(() => ({ service }), [service]);

  return <AnalyticsContext.Provider value={contextValue}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics(): AnalyticsService {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalytics() must be called within an <AnalyticsProvider>');
  }
  return context.service;
}
