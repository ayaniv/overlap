import { useCallback, useEffect, useRef } from 'react';
import { useLogger } from '../logger/LoggerProvider';
import { encodeConfig } from '../clock/shareCodec';
import type { ClockConfig } from '../clock/types';
import { getOverlapApiBaseUrl } from './overlapApiConfig';
import { buildShortLinkUrl, createShortLink } from './shortLinkApi';

type CacheEntry = { status: 'pending' } | { status: 'ready'; url: string } | { status: 'failed' };

// creates a short link in the background as soon as `shouldPrefetch` turns
// true (the menu opening in view mode — see App.tsx), so Share never has to
// wait on the network. The cache key is content-based (encodeConfig of the
// config with meetings removed, since createShortLink's POST body drops them
// too — see decision 3), so re-opening the menu on an unchanged config reuses
// the same link instead of re-POSTing, and a failed key isn't retried so a
// down API isn't hit on every menu open.
export function useShortLinkPrefetch(config: ClockConfig, shouldPrefetch: boolean): () => string | null {
  const logger = useLogger();
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const cacheKey = encodeConfig({ ...config, meetings: [] });

  useEffect(() => {
    const baseUrl = getOverlapApiBaseUrl();
    if (!shouldPrefetch || !baseUrl) return;
    if (cacheRef.current.has(cacheKey)) return;

    cacheRef.current.set(cacheKey, { status: 'pending' });

    createShortLink(baseUrl, config).then((result) => {
      if (result.ok) {
        cacheRef.current.set(cacheKey, { status: 'ready', url: buildShortLinkUrl(window.location.origin, result.id) });
      } else {
        cacheRef.current.set(cacheKey, { status: 'failed' });
        logger.error(new Error(`short link create failed: ${result.reason}`), 'failed to create short link for Share');
      }
    });
  }, [cacheKey, shouldPrefetch, config, logger]);

  return useCallback(() => {
    const entry = cacheRef.current.get(cacheKey);
    return entry?.status === 'ready' ? entry.url : null;
  }, [cacheKey]);
}
