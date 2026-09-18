import { useCallback, useEffect, useState } from 'react';
import { useAnalytics } from '../analytics/AnalyticsProvider';
import type { AnalyticsService } from '../analytics/AnalyticsService';
import { addLocationOp, addMeetingOp, removeLocationOp, removeMeetingOp, reorderLocationsOp, setHomeOp, updateLocationOp } from '../clock/configOps';
import { isValidClockConfig } from '../clock/configValidation';
import { DEFAULT_HOME_CITY, DEFAULT_WORLD_CITIES } from '../clock/defaultCities';
import { decodeConfig, encodeConfig, HASH_PREFIX } from '../clock/shareCodec';
import type { ClockConfig, Location, Meeting } from '../clock/types';
import { getOverlapApiBaseUrl } from '../shortLinks/overlapApiConfig';
import { parseShortLinkId, resolveShortLink } from '../shortLinks/shortLinkApi';
import type { ShortLinkFailureReason } from '../shortLinks/shortLinkApi';

export const CONFIG_STORAGE_KEY = 'overlap:config:v1';

export const DEFAULT_CONFIG: ClockConfig = {
  home: DEFAULT_HOME_CITY,
  rings: DEFAULT_WORLD_CITIES,
  meetings: [],
};

export type ShortLinkStatus = 'idle' | 'resolving' | 'failed';
type SharedConfigSource = 'hash' | 'short_link';

// pure: extracts and decodes the `#c=` share payload from a location.hash string
export function parseHashConfig(hash: string): ClockConfig | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const encoded = hash.slice(HASH_PREFIX.length);
  if (!encoded) return null;
  return decodeConfig(encoded);
}

// pure: parses the raw localStorage value, logging (not throwing) on corrupt
// or wrong-shape data (e.g. left over from an older schema version)
export function parseStoredConfig(raw: string | null): ClockConfig | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidClockConfig(parsed)) {
      console.error('overlap: stored config has the wrong shape', parsed);
      return null;
    }
    return parsed;
  } catch (err) {
    console.error('overlap: failed to parse stored config', err);
    return null;
  }
}

// pure: URL hash wins over localStorage, which wins over the built-in defaults
export function resolveInitialConfig(hash: string, storedRaw: string | null): ClockConfig {
  return parseHashConfig(hash) ?? parseStoredConfig(storedRaw) ?? DEFAULT_CONFIG;
}

function readStoredConfig(): ClockConfig | null {
  try {
    return parseStoredConfig(window.localStorage.getItem(CONFIG_STORAGE_KEY));
  } catch {
    return null;
  }
}

// shared by both share sources (hash and short link) so "the shared config
// loaded and no valid stored config existed" can't drift into two definitions
function trackSharedConfigLoaded(analytics: AnalyticsService, config: ClockConfig, source: SharedConfigSource): void {
  analytics.trackEvent('shared_config_loaded', {
    location_count: config.rings.length + 1,
    has_meetings: config.meetings.length > 0,
    source,
  });
}

// Always a *relative* hash-only write — whatever the current pathname is (the
// root session, `/popup.html`, or a short-link path like `/abc123`) is left
// alone, and only the `#c=…` fragment is replaced. This deliberately never
// resets a short-link path to `/`: the developer's stated preference is that
// the address bar must never change away from what was typed or opened. See
// tech-design.md's "URL mirror path" section for what that trades off.
function persistConfig(config: ClockConfig): void {
  try {
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('overlap: failed to persist config to localStorage', err);
  }

  try {
    window.history.replaceState(null, '', `${HASH_PREFIX}${encodeConfig(config)}`);
  } catch (err) {
    console.error('overlap: failed to mirror config to the URL hash', err);
  }
}

export function useClockConfig() {
  const analytics = useAnalytics();

  // Detect if this session loaded config from a share link (hash present but no
  // matching localStorage config), computed once at mount so it's stable
  const [loadedFromShare] = useState<ClockConfig | null>(() => {
    const hashConfig = parseHashConfig(window.location.hash);
    if (!hashConfig) return null;
    return readStoredConfig() ? null : hashConfig;
  });

  // a short-link path only matters when there's no hash (the hash always wins)
  // and the feature is switched on — computed once at mount, like loadedFromShare
  const [pendingShortLinkId] = useState<string | null>(() => {
    if (parseHashConfig(window.location.hash)) return null;
    if (!getOverlapApiBaseUrl()) return null;
    return parseShortLinkId(window.location.pathname);
  });

  // a short-link-shaped path with the API off is ignored (no fetch, no toast —
  // that's today's production reality), but still logged. Kept as its own
  // piece of state (computed the same way, pure) rather than a console.warn
  // inside the initializer above, so the warning fires from an effect instead
  // of a render-phase side effect.
  const [shortLinkPathIgnoredForMissingApiUrl] = useState<boolean>(() => {
    if (parseHashConfig(window.location.hash)) return false;
    return parseShortLinkId(window.location.pathname) !== null && !getOverlapApiBaseUrl();
  });

  useEffect(() => {
    if (shortLinkPathIgnoredForMissingApiUrl) {
      console.warn('overlap: short-link-shaped path ignored — VITE_OVERLAP_API_URL is not set', window.location.pathname);
    }
  }, [shortLinkPathIgnoredForMissingApiUrl]);

  const [config, setConfig] = useState<ClockConfig>(() => {
    let storedRaw: string | null = null;
    try {
      storedRaw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    } catch (err) {
      console.error('overlap: failed to read stored config', err);
    }
    return resolveInitialConfig(window.location.hash, storedRaw);
  });

  const [shortLinkStatus, setShortLinkStatus] = useState<ShortLinkStatus>(pendingShortLinkId ? 'resolving' : 'idle');
  const [shortLinkFailure, setShortLinkFailure] = useState<ShortLinkFailureReason | null>(null);

  useEffect(() => {
    if (loadedFromShare) {
      trackSharedConfigLoaded(analytics, loadedFromShare, 'hash');
    }
  }, [loadedFromShare, analytics]);

  // StrictMode-safe: the first mount's request is aborted by the cleanup below,
  // and an 'aborted' result is ignored rather than reported as a real failure
  useEffect(() => {
    if (!pendingShortLinkId) return;
    const baseUrl = getOverlapApiBaseUrl();
    if (!baseUrl) return;

    const controller = new AbortController();
    const wasFirstTimeVisitor = !readStoredConfig();

    resolveShortLink(baseUrl, pendingShortLinkId, fetch, controller.signal).then((result) => {
      if (!result.ok) {
        if (result.reason === 'aborted') return;
        setShortLinkStatus('failed');
        setShortLinkFailure(result.reason);
        return;
      }

      setConfig(result.config);
      setShortLinkStatus('idle');
      if (wasFirstTimeVisitor) {
        trackSharedConfigLoaded(analytics, result.config, 'short_link');
      }
    });

    return () => controller.abort();
  }, [pendingShortLinkId, analytics]);

  // skipped while resolving so the placeholder config never overwrites the
  // stored config's URL mirror and wipes out the short-link path before the
  // response arrives
  useEffect(() => {
    if (shortLinkStatus === 'resolving') return;
    persistConfig(config);
  }, [config, shortLinkStatus]);

  const setHome = useCallback((home: Location) => {
    setConfig((prev) => setHomeOp(prev, home));
  }, []);

  const addLocation = useCallback((location: Location) => {
    setConfig((prev) => addLocationOp(prev, location));
  }, []);

  const removeLocation = useCallback((id: string) => {
    setConfig((prev) => removeLocationOp(prev, id));
  }, []);

  const updateLocation = useCallback((id: string, patch: Partial<Location>) => {
    setConfig((prev) => updateLocationOp(prev, id, patch));
  }, []);

  const addMeeting = useCallback((meeting: Meeting) => {
    setConfig((prev) => addMeetingOp(prev, meeting));
  }, []);

  const removeMeeting = useCallback((id: string) => {
    setConfig((prev) => removeMeetingOp(prev, id));
  }, []);

  const reorder = useCallback((orderedIds: string[]) => {
    setConfig((prev) => reorderLocationsOp(prev, orderedIds));
  }, []);

  return {
    config,
    setHome,
    addLocation,
    removeLocation,
    updateLocation,
    addMeeting,
    removeMeeting,
    reorder,
    isResolvingShortLink: shortLinkStatus === 'resolving',
    shortLinkFailure,
  };
}
