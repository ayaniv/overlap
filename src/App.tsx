import { useCallback, useState } from 'react';
import { AddLocationForm } from './clock/AddLocationForm';
import { shareLink } from './clock/share';
import type { ShareOutcome } from './clock/share';
import { WorldClock } from './clock/WorldClock';
import type { Mode } from './clock/types';
import { useClockConfig } from './hooks/useClockConfig';
import { useNow } from './hooks/useNow';
import { useToast } from './hooks/useToast';

const SHARE_TOAST_MESSAGE: Partial<Record<ShareOutcome, string>> = {
  copied: 'Link copied',
  failed: "Couldn't copy link",
};

function App() {
  const now = useNow();
  const { config, addLocation, removeLocation } = useClockConfig();
  const [mode, setMode] = useState<Mode>('view');
  const { message: toastMessage, showToast } = useToast();

  const handleShare = useCallback(() => {
    void shareLink(navigator, navigator.clipboard, window.location.href).then((outcome) => {
      // "shared" (native share sheet shown) and "cancelled" (user dismissed it)
      // get no toast — the OS UI already gave feedback, or there's nothing to report
      const message = SHARE_TOAST_MESSAGE[outcome];
      if (message) showToast(message);
    });
  }, [showToast]);

  const exitEditMode = useCallback(() => setMode('view'), []);

  const modePanelContent =
    mode === 'edit' ? (
      <AddLocationForm
        existingIds={[config.home.id, ...config.rings.map((location) => location.id)]}
        existingColors={[config.home.color, ...config.rings.map((location) => location.color)]}
        onAdd={addLocation}
        onDone={exitEditMode}
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
      modePanelContent={modePanelContent}
      toastMessage={toastMessage}
    />
  );
}

export default App;
