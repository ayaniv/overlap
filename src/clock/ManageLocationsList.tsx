import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import DragHandleIcon from './icons/drag-handle.svg?react';
import HomeIcon from './icons/home.svg?react';
import type { Location } from './types';
import styles from './ManageLocationsList.module.css';

export type ManageLocationsListProps = {
  // inside -> outside: home first, then rings from innermost to outermost
  locations: Array<Location & { isHome: boolean }>;
  onReorder: (orderedIds: string[]) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
};

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
// (mirrors dragging a city into the home slot per the plan).
export function ManageLocationsList({ locations, onReorder, onRemove, onClose }: ManageLocationsListProps) {
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [liveOrder, setLiveOrder] = useState<string[] | null>(null);

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
      <div className={styles.heading}>Manage locations</div>
      <ul className={styles.list}>
        {displayOrder.map((id) => {
          const location = locationsById.get(id);
          if (!location) return null;
          return (
            <li key={id} ref={setRowRef(id)} className={id === draggedId ? styles.rowDragging : styles.row}>
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
              <span className={styles.swatch} style={{ background: location.color }} aria-hidden="true" />
              {location.isHome && <HomeIcon className={styles.homeIcon} aria-label="Home" />}
              <span className={styles.label}>{location.label}</span>
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
          );
        })}
      </ul>
      <div className={styles.actions}>
        <button type="button" className={styles.closeButton} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
