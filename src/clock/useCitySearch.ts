import { useCallback, useMemo, useRef, useState } from 'react';
import { useLogger } from '../logger/LoggerProvider';
import { FALLBACK_CITIES, loadCityCatalog, searchCityList } from './cityCatalog';
import type { CityEntry } from './cityCatalog';

export type CityListStatus = 'idle' | 'loading' | 'ready' | 'failed';

type CityListState = { status: CityListStatus; cities: CityEntry[] };

// owns the lazy city-list load for the Add location field: nothing is fetched
// until requestLoad() is called (first focus or first typing), and a failed
// load degrades to the default cities instead of leaving the field empty
export function useCitySearch(query: string) {
  const logger = useLogger();
  const [state, setState] = useState<CityListState>({ status: 'idle', cities: [] });
  const hasRequestedLoadRef = useRef(false);

  const requestLoad = useCallback(() => {
    if (hasRequestedLoadRef.current) return;
    hasRequestedLoadRef.current = true;
    setState({ status: 'loading', cities: [] });
    loadCityCatalog().then(
      (cities) => setState({ status: 'ready', cities }),
      (error: unknown) => {
        logger.error(error, 'failed to load the city list for the Add location search');
        setState({ status: 'failed', cities: FALLBACK_CITIES });
      },
    );
  }, [logger]);

  const suggestions = useMemo(() => searchCityList(state.cities, query), [state.cities, query]);

  return { suggestions, status: state.status, requestLoad };
}
