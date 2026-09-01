import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { isValidClockConfig } from './configValidation';
import type { ClockConfig } from './types';

// the URL-hash prefix a serialized config is carried under — shared so
// useClockConfig and buildWebAppUrl (extension/src/PopupApp.tsx) don't each
// declare their own copy
export const HASH_PREFIX = '#c=';

// serializes a ClockConfig into a URL-hash-safe string (and back), so the share
// link (M3) and the URL-hash resolution in useClockConfig are just callers of
// this single codec
export function encodeConfig(config: ClockConfig): string {
  return compressToEncodedURIComponent(JSON.stringify(config));
}

export function decodeConfig(encoded: string): ClockConfig | null {
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const parsed: unknown = JSON.parse(json);
    if (!isValidClockConfig(parsed)) {
      console.error('overlap: decoded share payload has the wrong shape', parsed);
      return null;
    }
    return parsed;
  } catch (err) {
    console.error('overlap: failed to decode shared config', err);
    return null;
  }
}
