import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { ClockConfig } from './types';

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
    return JSON.parse(json) as ClockConfig;
  } catch (err) {
    console.error('overlap: failed to decode shared config', err);
    return null;
  }
}
