import posthog from 'posthog-js';
import { ensurePostHogInitialized } from '../posthog/posthogClient';
import { consoleLogParts } from './consoleLogParts';
import type { LoggerService } from './LoggerService';

export const postHogLogger: LoggerService = {
  ...consoleLogParts,
  error(error, context) {
    ensurePostHogInitialized();
    posthog.captureException(error, { context });
  },
};
