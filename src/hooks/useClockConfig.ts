import { useCallback, useEffect, useState } from 'react';
import { addLocationOp, addMeetingOp, removeLocationOp, setHomeOp, updateLocationOp } from '../clock/configOps';
import { isValidClockConfig } from '../clock/configValidation';
import { DEFAULT_HOME_CITY, DEFAULT_WORLD_CITIES } from '../clock/defaultCities';
import { decodeConfig, encodeConfig } from '../clock/shareCodec';
import type { ClockConfig, Location, Meeting } from '../clock/types';

export const CONFIG_STORAGE_KEY = 'overlap:config:v1';
const HASH_PREFIX = '#c=';

export const DEFAULT_CONFIG: ClockConfig = {
  home: DEFAULT_HOME_CITY,
  rings: DEFAULT_WORLD_CITIES,
  meetings: [],
};

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
  const [config, setConfig] = useState<ClockConfig>(() => {
    let storedRaw: string | null = null;
    try {
      storedRaw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    } catch (err) {
      console.error('overlap: failed to read stored config', err);
    }
    return resolveInitialConfig(window.location.hash, storedRaw);
  });

  useEffect(() => {
    persistConfig(config);
  }, [config]);

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

  return { config, setHome, addLocation, removeLocation, updateLocation, addMeeting };
}
