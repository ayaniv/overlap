import posthog from 'posthog-js';
import { ensurePostHogInitialized } from '../posthog/posthogClient';
import type { LoggerService } from './LoggerService';

export const postHogLogger: LoggerService = {
  debug(message) {
    console.debug(`overlap: ${message}`);
  },
  info(message) {
    console.info(`overlap: ${message}`);
  },
  warn(message) {
    console.warn(`overlap: ${message}`);
  },
  error(error, context) {
    ensurePostHogInitialized();
    posthog.captureException(error, { context });
  },
};
