import { useCallback, useState } from 'react';
import { WorldClock } from './clock/WorldClock';
import type { Mode } from './clock/types';
import { useClockConfig } from './hooks/useClockConfig';
import { useNow } from './hooks/useNow';

function App() {
  const now = useNow();
  const { config } = useClockConfig();
  const [mode, setMode] = useState<Mode>('view');

  const handleShare = useCallback(() => {
    // implemented in M3 (copy-link + toast); logged for now so the click is observable
    console.info('overlap: share requested (share flow lands in M3)');
  }, []);

  return (
    <WorldClock
      now={now}
      home={config.home}
      rings={config.rings}
      meetings={config.meetings}
      mode={mode}
      onSetMode={setMode}
      onShare={handleShare}
    />
  );
}

export default App;
