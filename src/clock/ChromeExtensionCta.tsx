import { useEffect, useState } from 'react';
import { useAnalytics } from '../analytics/AnalyticsProvider';
import {
  CHROME_EXTENSION_CTA_ARIA_LABEL,
  CHROME_EXTENSION_CTA_LABEL,
  CHROME_EXTENSION_SECONDARY_LABEL,
  CHROME_WEB_STORE_URL,
  isChromiumDesktop,
} from './chromeExtension';
import styles from './ChromeExtensionCta.module.css';
import clockStyles from './WorldClock.module.css';

export type ChromeExtensionCtaPlacement = 'hero' | 'header';

interface ChromeExtensionCtaProps {
  placement: ChromeExtensionCtaPlacement;
}

// 'unknown' is what the server and the first client render both produce, so
// markup can't mismatch on hydration; the real answer lands after mount
type BrowserSupport = 'unknown' | 'installable' | 'not-installable';

export function ChromeExtensionCta({ placement }: ChromeExtensionCtaProps) {
  const analytics = useAnalytics();
  const [browserSupport, setBrowserSupport] = useState<BrowserSupport>('unknown');

  useEffect(() => {
    setBrowserSupport(isChromiumDesktop() ? 'installable' : 'not-installable');
  }, []);

  const handleClick = () => analytics.trackEvent('chrome_extension_cta_clicked', { placement });

  const linkProps = {
    href: CHROME_WEB_STORE_URL,
    target: '_blank',
    rel: 'noopener noreferrer',
    onClick: handleClick,
  };

  switch (browserSupport) {
    case 'installable':
      return (
        <a
          {...linkProps}
          className={`${clockStyles.findTimeButton} ${styles.cta}`}
          data-testid={`chrome-extension-cta-${placement}`}
          aria-label={CHROME_EXTENSION_CTA_ARIA_LABEL}
        >
          {CHROME_EXTENSION_CTA_LABEL}
        </a>
      );
    case 'not-installable':
      // the header stays quiet for browsers that can't install; the hero
      // still tells the truth with a low-emphasis link
      if (placement === 'header') return null;
      return (
        <a {...linkProps} className={styles.secondaryLink} data-testid="chrome-extension-secondary-link">
          {CHROME_EXTENSION_SECONDARY_LABEL}
        </a>
      );
    case 'unknown':
      return null;
  }
}
