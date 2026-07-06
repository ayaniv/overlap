import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { searchCities } from './cityCatalog';
import type { CityEntry } from './cityCatalog';
import { DEFAULT_WORK_END, DEFAULT_WORK_START, PALETTE } from './defaultCities';
import {
  buildNewLocation,
  isValidHexColor,
  MAX_WORK_END,
  MAX_WORK_START,
  MIN_WORK_END,
  MIN_WORK_START,
  validateNewLocation,
} from './locationForm';
import type { Location } from './types';
import styles from './AddLocationForm.module.css';

export type AddLocationFormProps = {
  existingIds: string[];
  onAdd: (location: Location) => void;
  onCancel: () => void;
};

const FALLBACK_SWATCH_COLOR = '#000000';

// renders inside the edit-mode panel anchored next to the Edit button: typeahead
// city search that becomes an editable label once a city is picked, color
// (swatches + free hex + native picker), and per-location work hours.
export function AddLocationForm({ existingIds, onAdd, onCancel }: AddLocationFormProps) {
  const [query, setQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState<CityEntry | null>(null);
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [workStart, setWorkStart] = useState(DEFAULT_WORK_START);
  const [workEnd, setWorkEnd] = useState(DEFAULT_WORK_END);
  const [error, setError] = useState<string | null>(null);

  const suggestions = useMemo(() => (selectedCity ? [] : searchCities(query)), [query, selectedCity]);

  const pickCity = (city: CityEntry) => {
    setSelectedCity(city);
    setQuery(city.label);
    setError(null);
  };

  const clearCity = () => {
    setSelectedCity(null);
    setQuery('');
  };

  const resetForm = () => {
    setQuery('');
    setSelectedCity(null);
    setColor(PALETTE[0]);
    setWorkStart(DEFAULT_WORK_START);
    setWorkEnd(DEFAULT_WORK_END);
    setError(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const input = { city: selectedCity, label: query, color, workStart, workEnd };
    const validationError = validateNewLocation(input);
    if (validationError) {
      setError(validationError);
      return;
    }
    onAdd(buildNewLocation(input, existingIds));
    resetForm();
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.heading}>Add location</div>

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

      {selectedCity && (
        <div className={styles.selectedMeta}>
          <span>{selectedCity.timezoneId}</span>
          <button type="button" className={styles.changeCity} onClick={clearCity}>
            Change
          </button>
        </div>
      )}

      <div className={styles.colorRow}>
        {PALETTE.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={color === swatch ? styles.swatchActive : styles.swatch}
            style={{ background: swatch }}
            aria-label={`Color ${swatch}`}
            aria-pressed={color === swatch}
            onClick={() => setColor(swatch)}
          />
        ))}
      </div>
      <div className={styles.hexRow}>
        <input
          className={styles.hexInput}
          type="text"
          value={color}
          onChange={(event) => setColor(event.target.value)}
          aria-label="Hex color"
        />
        <input
          className={styles.colorPicker}
          type="color"
          value={isValidHexColor(color) ? color : FALLBACK_SWATCH_COLOR}
          onChange={(event) => setColor(event.target.value)}
          aria-label="Pick color"
        />
      </div>

      <div className={styles.hoursRow}>
        <label className={styles.hoursLabel}>
          Start
          <input
            className={styles.hoursInput}
            type="number"
            min={MIN_WORK_START}
            max={MAX_WORK_START}
            value={workStart}
            onChange={(event) => setWorkStart(Number(event.target.value))}
          />
        </label>
        <label className={styles.hoursLabel}>
          End
          <input
            className={styles.hoursInput}
            type="number"
            min={MIN_WORK_END}
            max={MAX_WORK_END}
            value={workEnd}
            onChange={(event) => setWorkEnd(Number(event.target.value))}
          />
        </label>
      </div>

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={styles.addButton}>
          Add
        </button>
      </div>
    </form>
  );
}
