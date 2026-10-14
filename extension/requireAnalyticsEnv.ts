export const ALLOW_NO_ANALYTICS_VAR = 'ALLOW_NO_ANALYTICS';

const REQUIRED_VARS = ['VITE_POSTHOG_PROJECT_TOKEN', 'VITE_POSTHOG_HOST'] as const;

// These are inlined at build time, so a bundle built without them can never
// send analytics — and the popup only warns in its own console. Failing the
// build is the only place the omission is visible before a Web Store upload.
export function requireAnalyticsEnv(env: Record<string, string | undefined>): void {
  if (env[ALLOW_NO_ANALYTICS_VAR] === '1') return;
  const missing = REQUIRED_VARS.filter((name) => !env[name]?.trim());
  if (missing.length === 0) return;
  throw new Error(
    `Extension build is missing ${missing.join(', ')}; the bundle would ship with analytics off. ` +
      `Set them in .env.local, or set ${ALLOW_NO_ANALYTICS_VAR}=1 to build without analytics on purpose.`,
  );
}
