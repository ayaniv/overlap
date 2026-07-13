import { useContext } from 'react';
import { LoggerContext } from './LoggerContext';
import type { LoggerService } from './LoggerService';

export function useLogger(): LoggerService {
  const context = useContext(LoggerContext);
  if (!context) {
    throw new Error('useLogger() must be called within a <LoggerProvider>');
  }
  return context.service;
}
