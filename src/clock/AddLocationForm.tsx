import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useAnalytics } from '../analytics/AnalyticsProvider';
import { searchCities } from './cityCatalog';
import type { CityEntry } from './cityCatalog';
import { DEFAULT_WORK_END, DEFAULT_WORK_START } from './defaultCities';
import { buildNewLocation, pickAvailableColor, validateNewLocation } from './locationForm';
import type { NewLocationInput } from './locationForm';
import { LocationColorAndHoursFields } from './LocationColorAndHoursFields';
import type { Location } from './types';
import styles from './AddLocationForm.module.css';

export type AddLocationFormProps = {
  existingIds: string[];
  existingColors: string[];
  onAdd: (location: Location) => void;
  onDone: () => void;
  // mobile: picking a city adds it immediately with default color/hours,
  // skipping the swatches/hex/hours/Cancel-Add step entirely — redundant taps
  // for a screen this size per feedback. Desktop keeps the full customize-
  // then-confirm flow.
  isPortrait?: boolean;
};

// renders inside the edit-mode panel anchored next to the Edit button: typeahead
// city search that becomes an editable label once a city is picked, color
// (swatches + free hex + native picker), and per-location work hours. On
// mobile (isPortrait), it's just the search box — see isPortrait above.
export function AddLocationForm({ existingIds, existingColors, onAdd, onDone, isPortrait = false }: AddLocationFormProps) {
  const analytics = useAnalytics();
  const [query, setQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState<CityEntry | null>(null);
  const [color, setColor] = useState<string>(() => pickAvailableColor(existingColors));
  const [workStart, setWorkStart] = useState(DEFAULT_WORK_START);
  const [workEnd, setWorkEnd] = useState(DEFAULT_WORK_END);
  const [error, setError] = useState<string | null>(null);
  const [hasAdded, setHasAdded] = useState(false);

  const suggestions = useMemo(() => (selectedCity ? [] : searchCities(query)), [query, selectedCity]);

  // `usedColors` lets the caller factor in a color not yet reflected in the
  // existingColors prop (namely the one just submitted) so back-to-back adds
  // in the same edit session don't suggest the same swatch twice
  const resetForm = (usedColors: string[] = existingColors) => {
    setQuery('');
    setSelectedCity(null);
    setColor(pickAvailableColor(usedColors));
    setWorkStart(DEFAULT_WORK_START);
    setWorkEnd(DEFAULT_WORK_END);
    setError(null);
  };

  // shared by the desktop form's Add submit and mobile's immediate add-on-pick
  const submitLocation = (input: NewLocationInput) => {
    const validationError = validateNewLocation(input);
    if (validationError) {
      setError(validationError);
      return;
    }
    onAdd(buildNewLocation(input, existingIds));
    analytics.trackEvent('location_added', {
      timezone_id: selectedCity?.timezoneId,
      country: selectedCity?.country,
    });
    setHasAdded(true);
    resetForm([...existingColors, input.color]);
  };

  const pickCity = (city: CityEntry) => {
    if (isPortrait) {
      submitLocation({ city, label: city.label, color, workStart: DEFAULT_WORK_START, workEnd: DEFAULT_WORK_END });
      return;
    }
    setSelectedCity(city);
    setQuery(city.label);
    setError(null);
  };

  const clearCity = () => {
    setSelectedCity(null);
    setQuery('');
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    submitLocation({ city: selectedCity, label: query, color, workStart, workEnd });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <input
          className={styles.textInput}
          type="text"
          placeholder="Search city…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (selectedCity) setSelectedCity(null);
          }}
          aria-label="Search city"
          autoComplete="off"
        />
        {suggestions.length > 0 && (
          <ul className={styles.suggestions}>
            {suggestions.map((city) => (
              <li key={`${city.timezoneId}-${city.label}`}>
                <button type="button" className={styles.suggestion} onClick={() => pickCity(city)}>
                  {city.label}
                  <span className={styles.suggestionCountry}>{city.country}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* desktop only: on mobile, picking a suggestion above adds the location
          immediately with default color/hours (see pickCity/isPortrait) — no
          customize-then-confirm step, so none of this renders there */}
      {!isPortrait && (
        <>
          {selectedCity && (
            <div className={styles.selectedMeta}>
              <span>{selectedCity.timezoneId}</span>
              <button type="button" className={styles.changeCity} onClick={clearCity}>
                Change
              </button>
            </div>
          )}

          <LocationColorAndHoursFields
            color={color}
            hexValue={color}
            onHexInputChange={setColor}
            onColorPick={setColor}
            workStart={workStart}
            workEnd={workEnd}
            onChangeWorkStart={setWorkStart}
            onChangeWorkEnd={setWorkEnd}
          />
        </>
      )}

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      {!isPortrait && (
        <div className={styles.actions}>
          <button type="button" className={styles.doneButton} onClick={onDone}>
            {hasAdded ? 'Done' : 'Cancel'}
          </button>
          <button type="submit" className={styles.addButton}>
            Add
          </button>
        </div>
      )}
    </form>
  );
}
