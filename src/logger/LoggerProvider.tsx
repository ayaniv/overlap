import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { LoggerService } from './LoggerService';

interface LoggerContextValue {
  service: LoggerService;
}

// no real default: useLogger() throws when this is still undefined, so a
// render tree that forgets to wrap in <LoggerProvider> (most commonly a
// test rendering a component in isolation) fails loudly instead of silently
// falling through to the real, unmocked posthog-js singleton
const LoggerContext = createContext<LoggerContextValue | undefined>(undefined);

export type LoggerProviderProps = {
  children: ReactNode;
  // required, not defaulted: a static import of the real `logger` singleton
  // here would pull posthog-js into every consumer's bundle (including the
  // extension popup, which can never load it under MV3's CSP) — see
  // tech-design.md's bundling measurement. The composition root (main.tsx)
  // is the only place that should name a vendor.
  service: LoggerService;
};

export function LoggerProvider({ children, service }: LoggerProviderProps) {
  const contextValue = useMemo(() => ({ service }), [service]);

  return <LoggerContext.Provider value={contextValue}>{children}</LoggerContext.Provider>;
}

export function useLogger(): LoggerService {
  const context = useContext(LoggerContext);
  if (!context) {
    throw new Error('useLogger() must be called within a <LoggerProvider>');
  }
  return context.service;
}
