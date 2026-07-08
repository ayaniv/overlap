import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { PALETTE } from './defaultCities';
import { DragHandleIcon } from './icons/DragHandleIcon';
import { HomeIcon } from './icons/HomeIcon';
import { isValidHexColor, MAX_WORK_END, MAX_WORK_START, MIN_WORK_END, MIN_WORK_START } from './locationForm';
import type { Location } from './types';
import styles from './ManageLocationsList.module.css';

export type ManageLocationsListProps = {
  // inside -> outside: home first, then rings from innermost to outermost
  locations: Array<Location & { isHome: boolean }>;
  onReorder: (orderedIds: string[]) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  // mobile's MobileConfigView already has its own persistent "Done" header —
  // this list's own Close button would just be a second, redundant way to do
  // the exact same thing right below it
  hideCloseButton?: boolean;
  // tapping a row expands it to reveal these — color/hours were only settable
  // at add-time before (and not at all on mobile's simplified add flow), so
  // this is the only place left to edit them after the fact, or promote a
  // ring to home without dragging it there
  onUpdateLocation: (id: string, patch: Partial<Location>) => void;
  onSetHome: (location: Location) => void;
};

const FALLBACK_SWATCH_COLOR = '#000000';

// counts how many of the other rows' current centers sit above `pointerY`,
// which is exactly the dragged row's target index among them
function dropIndexFor(pointerY: number, draggedId: string, order: string[], rows: Map<string, HTMLLIElement>): number {
  let dropIndex = 0;
  for (const id of order) {
    if (id === draggedId) continue;
    const rect = rows.get(id)?.getBoundingClientRect();
    if (rect && pointerY > rect.top + rect.height / 2) dropIndex++;
  }
  return dropIndex;
}

function withMovedId(order: string[], draggedId: string, dropIndex: number): string[] {
  const rest = order.filter((id) => id !== draggedId);
  rest.splice(dropIndex, 0, draggedId);
  return rest;
}

// renders below AddLocationForm in the config panel: one row per location
// currently on the clock (home + every ring), inside->outside. Drag a row by
// its grip handle to reorder; the list reorders live as it crosses a
// neighbor, and dragging a ring past the home slot promotes it to home
// (mirrors dragging a city into the home slot per the plan). Tapping a row
// (rather than the drag handle or remove button) expands it in place to edit
// color/hours or set it as home.
export function ManageLocationsList({
  locations,
  onReorder,
  onRemove,
  onClose,
  hideCloseButton = false,
  onUpdateLocation,
  onSetHome,
}: ManageLocationsListProps) {
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [liveOrder, setLiveOrder] = useState<string[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpanded = (id: string) => setExpandedId((current) => (current === id ? null : id));

  const originalOrder = locations.map((location) => location.id);
  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const displayOrder = liveOrder ?? originalOrder;

  const setRowRef = (id: string) => (el: HTMLLIElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  };

  const handlePointerDown = (id: string) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggedId(id);
    setLiveOrder(originalOrder);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggedId) return;
    setLiveOrder((current) => {
      const order = current ?? originalOrder;
      const dropIndex = dropIndexFor(event.clientY, draggedId, order, rowRefs.current);
      return withMovedId(order, draggedId, dropIndex);
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (liveOrder && liveOrder.some((id, index) => id !== originalOrder[index])) {
      onReorder(liveOrder);
    }
    setDraggedId(null);
    setLiveOrder(null);
  };

  return (
    <div className={styles.panel}>
      <ul className={styles.list}>
        {displayOrder.map((id) => {
          const location = locationsById.get(id);
          if (!location) return null;
          const isExpanded = expandedId === location.id;
          return (
            <li key={id} ref={setRowRef(id)} className={id === draggedId ? styles.rowDragging : styles.row}>
              <div className={styles.rowMain}>
                <button
                  type="button"
                  className={styles.dragHandle}
                  aria-label={`Reorder ${location.label}`}
                  onPointerDown={handlePointerDown(id)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  <DragHandleIcon />
                </button>
                <button
                  type="button"
                  className={styles.rowToggle}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Hide' : 'Edit'} ${location.label}`}
                  onClick={() => toggleExpanded(location.id)}
                >
                  <span className={styles.swatch} style={{ background: location.color }} aria-hidden="true" />
                  {location.isHome && <HomeIcon className={styles.homeIcon} aria-label="Home" />}
                  <span className={styles.label}>{location.label}</span>
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
              </div>

              {isExpanded && (
                <div className={styles.expanded}>
                  <div className={styles.colorRow}>
                    {PALETTE.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        className={location.color === swatch ? styles.swatchOptionActive : styles.swatchOption}
                        style={{ background: swatch }}
                        aria-label={`Color ${swatch}`}
                        aria-pressed={location.color === swatch}
                        onClick={() => onUpdateLocation(location.id, { color: swatch })}
                      />
                    ))}
                  </div>
                  <div className={styles.hexRow}>
                    <input
                      className={styles.hexInput}
                      type="text"
                      value={location.color}
                      onChange={(event) => onUpdateLocation(location.id, { color: event.target.value })}
                      aria-label={`Hex color for ${location.label}`}
                    />
                    <input
                      className={styles.colorPicker}
                      type="color"
                      value={isValidHexColor(location.color) ? location.color : FALLBACK_SWATCH_COLOR}
                      onChange={(event) => onUpdateLocation(location.id, { color: event.target.value })}
                      aria-label={`Pick color for ${location.label}`}
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
                        value={location.workStart}
                        onChange={(event) => onUpdateLocation(location.id, { workStart: Number(event.target.value) })}
                      />
                    </label>
                    <label className={styles.hoursLabel}>
                      End
                      <input
                        className={styles.hoursInput}
                        type="number"
                        min={MIN_WORK_END}
                        max={MAX_WORK_END}
                        value={location.workEnd}
                        onChange={(event) => onUpdateLocation(location.id, { workEnd: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                  {!location.isHome && (
                    <button type="button" className={styles.setHomeButton} onClick={() => onSetHome(location)}>
                      Set as home
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!hideCloseButton && (
        <div className={styles.actions}>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
