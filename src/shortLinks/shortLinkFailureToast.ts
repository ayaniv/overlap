import type { ShortLinkFailureReason } from './shortLinkApi';

// shown when a path-based short link fails to resolve on load (App.tsx) —
// 'not_found' is an expected outcome (a mistyped or stale URL), everything
// else reads as a generic "couldn't open" since the browser can't tell
// offline/API-down/CORS-refused apart (see shortLinkApi.ts)
export const SHORT_LINK_FAILURE_TOAST: Record<ShortLinkFailureReason, string> = {
  not_found: "That shared link wasn't found",
  rejected: "Couldn't open that shared link",
  server_error: "Couldn't open that shared link",
  network: "Couldn't open that shared link",
  timeout: "Couldn't open that shared link",
  invalid_response: "Couldn't open that shared link",
  aborted: "Couldn't open that shared link",
};
