export interface AnalyticsService {
  trackEvent(name: string, properties?: Record<string, unknown>): void;
}
