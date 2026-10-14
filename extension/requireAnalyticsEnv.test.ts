import { describe, expect, it } from 'vitest';
import { ALLOW_NO_ANALYTICS_VAR, requireAnalyticsEnv } from './requireAnalyticsEnv';

const CONFIGURED = { VITE_POSTHOG_PROJECT_TOKEN: 'phc_token', VITE_POSTHOG_HOST: 'https://us.i.posthog.com' };

describe('requireAnalyticsEnv', () => {
  it('passes when both PostHog variables are set', () => {
    expect(() => requireAnalyticsEnv(CONFIGURED)).not.toThrow();
  });

  it('throws naming each missing variable, so a store build cannot silently drop analytics', () => {
    expect(() => requireAnalyticsEnv({})).toThrow(/VITE_POSTHOG_PROJECT_TOKEN.*VITE_POSTHOG_HOST/);
    expect(() => requireAnalyticsEnv({ VITE_POSTHOG_PROJECT_TOKEN: 'phc_token' })).toThrow(/VITE_POSTHOG_HOST/);
  });

  it('treats a blank or whitespace-only value as missing, matching the popup’s own runtime check', () => {
    expect(() => requireAnalyticsEnv({ ...CONFIGURED, VITE_POSTHOG_HOST: '   ' })).toThrow(/VITE_POSTHOG_HOST/);
  });

  it('lets a build without analytics through only when explicitly opted out', () => {
    expect(() => requireAnalyticsEnv({ [ALLOW_NO_ANALYTICS_VAR]: '1' })).not.toThrow();
    expect(() => requireAnalyticsEnv({ [ALLOW_NO_ANALYTICS_VAR]: '0' })).toThrow();
  });
});
