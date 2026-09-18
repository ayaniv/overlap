import { useCallback } from 'react';
import { useAnalytics } from '../analytics/AnalyticsProvider';
import { SHARE_TOAST_MESSAGE, shareLink } from './share';
import type { ShareTarget } from './share';

// shared by App.tsx (a short link when one is ready, the current page's hash
// URL otherwise) and the extension popup (always a hash URL built from its own
// config) — same outcome -> toast -> analytics.trackEvent('clock_shared')
// pipeline either way, only the share target itself differs. `getShareTarget`
// is a callback (not a plain value) so each caller controls its own
// memoization, and so App.tsx can resolve it at click time from a prefetch
// cache instead of the network (see useShortLinkPrefetch).
export function useShareHandler(getShareTarget: () => ShareTarget, showToast: (text: string) => void): () => void {
  const analytics = useAnalytics();

  return useCallback(() => {
    const target = getShareTarget();
    void shareLink(navigator, navigator.clipboard, target.url).then((outcome) => {
      // "shared" (native share sheet shown) and "cancelled" (user dismissed it)
      // get no toast — the OS UI already gave feedback, or there's nothing to report
      const message = SHARE_TOAST_MESSAGE[outcome];
      if (message) showToast(message);
      analytics.trackEvent('clock_shared', { outcome, link_type: target.linkType });
    });
  }, [getShareTarget, showToast, analytics]);
}
