import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import './popup.css';
import { AnalyticsProvider } from '../../src/analytics/AnalyticsProvider';
import { LoggerProvider } from '../../src/logger/LoggerProvider';
import { createHttpPostHogService } from './httpPostHogService';
import { PopupApp } from './PopupApp';

// one instance, one service: both AnalyticsService and LoggerService are the
// same fetch-based PostHog transport (see tech-design.md's
// httpPostHogService section) — a single distinct_id-bearing instance is
// shared between the two providers rather than each constructing its own
const service = createHttpPostHogService();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AnalyticsProvider service={service}>
      <LoggerProvider service={service}>
        <PopupApp />
      </LoggerProvider>
    </AnalyticsProvider>
  </StrictMode>,
);
