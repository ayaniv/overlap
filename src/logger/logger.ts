import { postHogLogger } from './postHogLogger';
import type { LoggerService } from './LoggerService';

// the one line to change to swap logging providers — everything else in the app
// only ever imports `logger` or calls `useLogger()`, never a vendor SDK directly
export const logger: LoggerService = postHogLogger;
