import { useCallback, useState } from 'react';
import { AddLocationForm } from './clock/AddLocationForm';
import { copyShareLink } from './clock/share';
import { WorldClock } from './clock/WorldClock';
import type { Mode } from './clock/types';
import { useClockConfig } from './hooks/useClockConfig';
import { useNow } from './hooks/useNow';
import { useToast } from './hooks/useToast';

const SHARE_SUCCESS_MESSAGE = 'Link copied';
const SHARE_FAILURE_MESSAGE = "Couldn't copy link";

function App() {
  const now = useNow();
  const { config, addLocation, removeLocation } = useClockConfig();
  const [mode, setMode] = useState<Mode>('view');
  const { message: toastMessage, showToast } = useToast();

  const handleShare = useCallback(() => {
    void copyShareLink(navigator.clipboard, window.location.href).then((didCopy) => {
      showToast(didCopy ? SHARE_SUCCESS_MESSAGE : SHARE_FAILURE_MESSAGE);
    });
  }, [showToast]);

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
      toastMessage={toastMessage}
    />
  );
}

export default App;
