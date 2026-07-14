import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { logger } from './logger';
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
  service?: LoggerService;
};

export function LoggerProvider({ children, service = logger }: LoggerProviderProps) {
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
