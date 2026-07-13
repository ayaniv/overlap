import { useMemo, type ReactNode } from 'react';
import { logger } from './logger';
import { LoggerContext } from './LoggerContext';
import type { LoggerService } from './LoggerService';

export type LoggerProviderProps = {
  children: ReactNode;
  service?: LoggerService;
};

export function LoggerProvider({ children, service = logger }: LoggerProviderProps) {
  const contextValue = useMemo(() => ({ service }), [service]);

  return <LoggerContext.Provider value={contextValue}>{children}</LoggerContext.Provider>;
}
