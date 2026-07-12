import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AnalyticsProvider } from './AnalyticsProvider';
import { useAnalytics } from './useAnalytics';
import { analytics } from './analytics';
import { createMockAnalyticsService } from './mockAnalyticsService';

afterEach(cleanup);

describe('useAnalytics / AnalyticsProvider', () => {
  it('throws when no provider is present, instead of silently using the real singleton', () => {
    expect(() => renderHook(() => useAnalytics())).toThrow(/AnalyticsProvider/);
  });

  it('returns the real singleton by default when AnalyticsProvider has no service prop', () => {
    const { result } = renderHook(() => useAnalytics(), {
      wrapper: ({ children }) => <AnalyticsProvider>{children}</AnalyticsProvider>,
    });
    expect(result.current).toBe(analytics);
  });

  it('returns a custom service when one is passed to AnalyticsProvider', () => {
    const mockService = createMockAnalyticsService();
    const { result } = renderHook(() => useAnalytics(), {
      wrapper: ({ children }) => <AnalyticsProvider service={mockService}>{children}</AnalyticsProvider>,
    });
    expect(result.current).toBe(mockService);
  });
});
