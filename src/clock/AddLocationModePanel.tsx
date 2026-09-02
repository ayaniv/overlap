import { AddLocationForm } from './AddLocationForm';
import type { ClockConfig, Location } from './types';

export type AddLocationModePanelProps = {
  config: ClockConfig;
  onAdd: (location: Location) => void;
  onDone: () => void;
  isPortrait?: boolean;
};

// the edit-mode `modePanelContent` App.tsx and the extension popup both pass
// to WorldClock — existingIds/existingColors are derived from `config` the
// same way in both, so this is the one place that derivation happens instead
// of two copies
export function AddLocationModePanel({ config, onAdd, onDone, isPortrait }: AddLocationModePanelProps) {
  return (
    <AddLocationForm
      existingIds={[config.home.id, ...config.rings.map((location) => location.id)]}
      existingColors={[config.home.color, ...config.rings.map((location) => location.color)]}
      onAdd={onAdd}
      onDone={onDone}
      isPortrait={isPortrait}
    />
  );
}
