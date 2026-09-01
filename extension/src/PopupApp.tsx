import { useCallback, useState } from 'react';
import { useAnalytics } from '../../src/analytics/AnalyticsProvider';
import { useLogger } from '../../src/logger/LoggerProvider';
import { AddLocationForm } from '../../src/clock/AddLocationForm';
import { SHARE_TOAST_MESSAGE, shareLink } from '../../src/clock/share';
import { WEB_APP_PRIVACY_URL, buildWebAppUrl } from '../../src/clock/webAppUrl';
import { WorldClock } from '../../src/clock/WorldClock';
import type { Mode } from '../../src/clock/types';
import { useClockConfig } from '../../src/hooks/useClockConfig';
import { useIsPortrait } from '../../src/hooks/useIsPortrait';
import { useNow } from '../../src/hooks/useNow';
import { useToast } from '../../src/hooks/useToast';
import { openWebApp } from './openWebApp';

// a different composition of the same parts App.tsx uses, not a fork of
// App — see tech-design.md's "Why the popup can't just render <App />" for
// the three MV3-specific blockers this sidesteps (remote Google Identity
// Services script, a relative /privacy.html link, and window.location.href
// being a useless chrome-extension:// URL to share)
export function PopupApp() {
  const analytics = useAnalytics();
  const logger = useLogger();
  const now = useNow();
  const { config, addLocation, removeLocation, updateLocation, setHome, reorder } = useClockConfig();
  const [mode, setMode] = useState<Mode>('view');
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);
  const isPortrait = useIsPortrait();
  const { message: toastMessage, showToast } = useToast();

  const handleShare = useCallback(() => {
    void shareLink(navigator, navigator.clipboard, buildWebAppUrl(config)).then((outcome) => {
      const message = SHARE_TOAST_MESSAGE[outcome];
      if (message) showToast(message);
      analytics.trackEvent('clock_shared', { outcome });
    });
  }, [config, showToast, analytics]);

  const handleOpenInWebApp = useCallback(() => {
    analytics.trackEvent('extension_open_web_app_clicked');
    void openWebApp(config, logger);
  }, [config, analytics, logger]);

  const modePanelContent =
    mode === 'edit' ? (
      <AddLocationForm
        existingIds={[config.home.id, ...config.rings.map((location) => location.id)]}
        existingColors={[config.home.color, ...config.rings.map((location) => location.color)]}
        onAdd={addLocation}
        onDone={() => setMode('view')}
        isPortrait={isPortrait}
      />
    ) : undefined;

  return (
    <WorldClock
      now={now}
      home={config.home}
      rings={config.rings}
      meetings={config.meetings}
      mode={mode}
      onSetMode={setMode}
      onShare={handleShare}
      isMenuExpanded={isMenuExpanded}
      onMenuExpandedChange={setIsMenuExpanded}
      onRemoveLocation={removeLocation}
      onReorder={reorder}
      onUpdateLocation={updateLocation}
      onSetHome={setHome}
      modePanelContent={modePanelContent}
      toastMessage={toastMessage}
      isPortrait={isPortrait}
      onOpenInWebApp={handleOpenInWebApp}
      privacyHref={WEB_APP_PRIVACY_URL}
    />
  );
}
