import { HASH_PREFIX, encodeConfig } from './shareCodec';
import type { ClockConfig } from './types';

// single source of truth for the two places the popup needs a link back to
// the full web app: Share (a link anyone can open) and Open in Overlap (a
// same-device handoff of the current config)
export const WEB_APP_ORIGIN = 'https://overlapclock.com';
export const WEB_APP_PRIVACY_URL = `${WEB_APP_ORIGIN}/privacy.html`;

export function buildWebAppUrl(config: ClockConfig): string {
  return `${WEB_APP_ORIGIN}/${HASH_PREFIX}${encodeConfig(config)}`;
}
