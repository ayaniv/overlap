import { useAnalytics } from '../analytics/AnalyticsProvider';
import { useChromiumDesktopSupport } from '../hooks/useChromiumDesktopSupport';
import { CHROME_EXTENSION_CTA_HIDDEN_SUFFIX, CHROME_EXTENSION_CTA_LABEL, CHROME_WEB_STORE_URL } from './chromeExtension';
import { ChromeIcon } from './icons/ChromeIcon';
import styles from './ChromeExtensionCta.module.css';
import visuallyHiddenStyles from './visuallyHidden.module.css';

export function ChromeExtensionCta() {
  const analytics = useAnalytics();
  const support = useChromiumDesktopSupport();

  if (support !== 'supported') return null;

  return (
    <a
      href={CHROME_WEB_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => analytics.trackEvent('chrome_extension_cta_clicked', { placement: 'header' })}
      className={styles.cta}
      data-testid="chrome-extension-cta"
    >
      <ChromeIcon className={styles.icon} data-testid="chrome-extension-cta-logo" />
      {CHROME_EXTENSION_CTA_LABEL}
      {/* the visible label alone satisfies WCAG 2.5.3 (Label in Name); this
          just adds context for screen-reader users without changing what a
          speech-control user needs to say. The space is its own text node,
          not folded into either string — accessible-name computation trims
          each node's own text before joining, so a leading/trailing space
          inside the span (or the label) would otherwise be silently dropped,
          running the two words together for screen-reader users. */}
      {' '}
      <span className={visuallyHiddenStyles.srOnly}>{CHROME_EXTENSION_CTA_HIDDEN_SUFFIX}</span>
    </a>
  );
}
