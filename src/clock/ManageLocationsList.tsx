import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { usePostHog } from '@posthog/react';
import { DragHandleIcon } from './icons/DragHandleIcon';
import { HomeIcon } from './icons/HomeIcon';
import { TrashIcon } from './icons/TrashIcon';
import { isValidHexColor } from './locationForm';
import { LocationColorAndHoursFields } from './LocationColorAndHoursFields';
import type { Location } from './types';
import styles from './ManageLocationsList.module.css';

type LocationEditorProps = {
  location: Location & { isHome: boolean };
  onUpdateLocation: (id: string, patch: Partial<Location>) => void;
  onSetHome: (location: Location) => void;
};

// the row's inline editor, revealed by tapping .rowToggle — its own component
// (rather than inlined in the parent's .map(), where hooks aren't allowed)
// specifically so hexDraft below resets via mount/unmount whenever a
// different row expands, instead of needing an effect to resync it (which
// would fight the once-a-second parent re-render from WorldClock's `now`)
function LocationEditor({ location, onUpdateLocation, onSetHome }: LocationEditorProps) {
  // buffered separately from location.color: applying every keystroke live
  // (AddLocationForm gates this behind a submit step instead) means an
  // incomplete typed hex — e.g. cut short by clicking "Set as home" mid-edit —
  // would otherwise get baked into the ring's actual rendered color. Only
  // forwarded to onUpdateLocation once it's a complete, valid hex; the swatch
  // and native picker below always produce a valid value, so they stay
  // in sync with both this draft and the committed color directly.
  const [hexDraft, setHexDraft] = useState(location.color);

  const commitColor = (value: string) => {
    setHexDraft(value);
    onUpdateLocation(location.id, { color: value });
  };

  return (
    <div className={styles.expanded}>
      <LocationColorAndHoursFields
        color={location.color}
        hexValue={hexDraft}
        onHexInputChange={(value) => {
          setHexDraft(value);
          if (isValidHexColor(value)) onUpdateLocation(location.id, { color: value });
        }}
        onColorPick={commitColor}
        workStart={location.workStart}
        workEnd={location.workEnd}
        onChangeWorkStart={(value) => onUpdateLocation(location.id, { workStart: value })}
        onChangeWorkEnd={(value) => onUpdateLocation(location.id, { workEnd: value })}
        ariaLabelSuffix={` for ${location.label}`}
      />
      {!location.isHome && (
        <button type="button" className={styles.setHomeButton} onClick={() => onSetHome(location)}>
          Set as home
        </button>
      )}
    </div>
  );
}

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
  const posthog = usePostHog();
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
      posthog?.capture('locations_reordered', { location_count: liveOrder.length });
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
                    title={`Remove ${location.label}`}
                    onClick={() => {
                      posthog?.capture('location_removed');
                      onRemove(location.id);
                    }}
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>

              {isExpanded && <LocationEditor location={location} onUpdateLocation={onUpdateLocation} onSetHome={onSetHome} />}
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
