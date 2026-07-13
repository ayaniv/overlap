import { createContext } from 'react';
import type { LoggerService } from './LoggerService';

interface LoggerContextValue {
  service: LoggerService;
}

// no real default: useLogger() throws when this is still undefined, so a
// render tree that forgets to wrap in <LoggerProvider> (most commonly a
// test rendering a component in isolation) fails loudly instead of silently
// falling through to the real, unmocked posthog-js singleton
export const LoggerContext = createContext<LoggerContextValue | undefined>(undefined);
