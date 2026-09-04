import { useCallback } from 'react';
import { useAnalytics } from '../analytics/AnalyticsProvider';
import { SHARE_TOAST_MESSAGE, shareLink } from './share';

// shared by App.tsx (shares the current page URL) and the extension popup
// (shares a web-app URL built from its own config) — same outcome -> toast ->
// analytics.trackEvent('clock_shared') pipeline either way, only the share
// URL itself differs. `getShareUrl` is a callback (not a plain string) so
// each caller controls its own memoization — App.tsx's never changes
// identity, the popup's only when `config` does — without this hook forcing
// one policy on both.
export function useShareHandler(getShareUrl: () => string, showToast: (text: string) => void): () => void {
  const analytics = useAnalytics();

  return useCallback(() => {
    void shareLink(navigator, navigator.clipboard, getShareUrl()).then((outcome) => {
      // "shared" (native share sheet shown) and "cancelled" (user dismissed it)
      // get no toast — the OS UI already gave feedback, or there's nothing to report
      const message = SHARE_TOAST_MESSAGE[outcome];
      if (message) showToast(message);
      analytics.trackEvent('clock_shared', { outcome });
    });
  }, [getShareUrl, showToast, analytics]);
}
