import { useCallback, useState } from 'react';
import { AddLocationForm } from './clock/AddLocationForm';
import { WorldClock } from './clock/WorldClock';
import type { Mode } from './clock/types';
import { useClockConfig } from './hooks/useClockConfig';
import { useNow } from './hooks/useNow';

function App() {
  const now = useNow();
  const { config, addLocation, removeLocation } = useClockConfig();
  const [mode, setMode] = useState<Mode>('view');

  const handleShare = useCallback(() => {
    // implemented in M3 (copy-link + toast); logged for now so the click is observable
    console.info('overlap: share requested (share flow lands in M3)');
  }, []);

  const exitEditMode = useCallback(() => setMode('view'), []);

  const centerContent =
    mode === 'edit' ? (
      <AddLocationForm
        existingIds={[config.home.id, ...config.rings.map((location) => location.id)]}
        onAdd={addLocation}
        onCancel={exitEditMode}
      />
    ) : undefined;

  return (
    <WorldClock
      now={now}
      home={config.home}
      rings={config.rings}
      meetings={config.meetings}
      mode={mode}
      onSetMode={setMode}
      onShare={handleShare}
      onRemoveLocation={removeLocation}
      centerContent={centerContent}
    />
  );
}

export default App;
