import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { LoggerService } from './LoggerService';

export type MockLoggerService = LoggerService & {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
};

export function createMockLoggerService(): MockLoggerService {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}
