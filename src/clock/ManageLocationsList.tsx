import type { Location } from './types';
import styles from './ManageLocationsList.module.css';

export type ManageLocationsListProps = {
  // inside -> outside: home first, then rings from innermost to outermost
  locations: Array<Location & { isHome: boolean }>;
  onReorder: (orderedIds: string[]) => void;
  onRemove: (id: string) => void;
};

// renders below AddLocationForm in the config panel: one row per location
// currently on the clock (home + every ring), inside->outside. Up/down moves
// a row toward/away from center; moving a ring into the first slot promotes
// it to home (mirrors dragging a city into the home slot per the plan).
export function ManageLocationsList({ locations, onReorder, onRemove }: ManageLocationsListProps) {
  const move = (index: number, delta: 1 | -1) => {
    const target = index + delta;
    if (target < 0 || target >= locations.length) return;
    const orderedIds = locations.map((location) => location.id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
    onReorder(orderedIds);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>Manage locations</div>
      <ul className={styles.list}>
        {locations.map((location, index) => (
          <li key={location.id} className={styles.row}>
            <span className={styles.swatch} style={{ background: location.color }} aria-hidden="true" />
            {location.isHome && (
              <svg className={styles.homeIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-label="Home">
                <path d="M3 11l9-8 9 8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 10v10h14V10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <span className={styles.label}>{location.label}</span>
            <button
              type="button"
              className={styles.moveButton}
              aria-label={`Move ${location.label} up`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ▲
            </button>
            <button
              type="button"
              className={styles.moveButton}
              aria-label={`Move ${location.label} down`}
              disabled={index === locations.length - 1}
              onClick={() => move(index, 1)}
            >
              ▼
            </button>
            {!location.isHome && (
              <button
                type="button"
                className={styles.removeButton}
                aria-label={`Remove ${location.label}`}
                onClick={() => onRemove(location.id)}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
