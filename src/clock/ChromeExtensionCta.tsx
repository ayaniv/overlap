import { useEffect, useState } from 'react';
import { useAnalytics } from '../analytics/AnalyticsProvider';
import {
  CHROME_EXTENSION_CTA_ARIA_LABEL,
  CHROME_EXTENSION_CTA_LABEL,
  CHROME_WEB_STORE_URL,
  isChromiumDesktop,
} from './chromeExtension';
import { ChromeIcon } from './icons/ChromeIcon';
import styles from './ChromeExtensionCta.module.css';
import clockStyles from './WorldClock.module.css';

// 'unknown' is what the server and the first client render both produce, so
// markup can't mismatch on hydration; the real answer lands after mount
type BrowserSupport = 'unknown' | 'installable' | 'not-installable';

export function ChromeExtensionCta() {
  const analytics = useAnalytics();
  const [browserSupport, setBrowserSupport] = useState<BrowserSupport>('unknown');

  useEffect(() => {
    setBrowserSupport(isChromiumDesktop() ? 'installable' : 'not-installable');
  }, []);

  if (browserSupport !== 'installable') return null;

  return (
    <a
      href={CHROME_WEB_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => analytics.trackEvent('chrome_extension_cta_clicked', { placement: 'header' })}
      className={`${clockStyles.findTimeButton} ${styles.cta}`}
      data-testid="chrome-extension-cta"
      aria-label={CHROME_EXTENSION_CTA_ARIA_LABEL}
    >
      <ChromeIcon data-testid="chrome-extension-cta-logo" />
      {CHROME_EXTENSION_CTA_LABEL}
    </a>
  );
}
