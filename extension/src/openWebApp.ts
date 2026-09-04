import { buildWebAppUrl } from '../../src/clock/webAppUrl';
import type { ClockConfig } from '../../src/clock/types';
import type { LoggerService } from '../../src/logger/LoggerService';

// wraps chrome.tabs.create so the caller doesn't have to handle its rejection
// itself — `chrome.tabs.create` can reject (e.g. no "tabs"-adjacent
// permission, or the browser refusing to open the tab), and that failure
// must be observable rather than silently swallowed
export async function openWebApp(config: ClockConfig, logger: LoggerService): Promise<void> {
  try {
    await chrome.tabs.create({ url: buildWebAppUrl(config) });
  } catch (err) {
    logger.error(err, 'failed to open the web app from the popup');
  }
}
