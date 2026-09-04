import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LoggerProvider, useLogger } from './LoggerProvider';
import { createMockLoggerService } from './mockLoggerService';

afterEach(cleanup);

describe('useLogger / LoggerProvider', () => {
  it('throws when no provider is present, instead of silently using the real singleton', () => {
    expect(() => renderHook(() => useLogger())).toThrow(/LoggerProvider/);
  });

  it('returns a custom service when one is passed to LoggerProvider', () => {
    const mockService = createMockLoggerService();
    const { result } = renderHook(() => useLogger(), {
      wrapper: ({ children }) => <LoggerProvider service={mockService}>{children}</LoggerProvider>,
    });
    expect(result.current).toBe(mockService);
  });
});
