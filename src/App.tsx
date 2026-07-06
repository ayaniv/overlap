import { useCallback, useEffect, useMemo, useState } from 'react';
import { AddLocationForm } from './clock/AddLocationForm';
import { ScheduleForm } from './clock/ScheduleForm';
import { copyShareLink } from './clock/share';
import { useRingScrub } from './clock/useRingScrub';
import { WorldClock } from './clock/WorldClock';
import type { Mode } from './clock/types';
import { useClockConfig } from './hooks/useClockConfig';
import { useNow } from './hooks/useNow';
import { useToast } from './hooks/useToast';

const SHARE_SUCCESS_MESSAGE = 'Link copied';
const SHARE_FAILURE_MESSAGE = "Couldn't copy link";

function App() {
  const now = useNow();
  const { config, addLocation, removeLocation, addMeeting } = useClockConfig();
  const [mode, setMode] = useState<Mode>('view');
  const { message: toastMessage, showToast } = useToast();
  const { previewOffsetMs: scrubOffsetMs, isDragging: isScrubbing, reset: resetScrub, setOffsetMs, bind: scrubBind } = useRingScrub();

  const handleShare = useCallback(() => {
    void copyShareLink(navigator.clipboard, window.location.href).then((didCopy) => {
      showToast(didCopy ? SHARE_SUCCESS_MESSAGE : SHARE_FAILURE_MESSAGE);
    });
  }, [showToast]);

  const exitEditMode = useCallback(() => setMode('view'), []);
  const exitScheduleMode = useCallback(() => setMode('view'), []);

  // the ring-scrub preview offset only makes sense while actively scheduling; drop it
  // whenever schedule mode isn't active so re-entering (or switching to edit/share) starts
  // from "now" again
  useEffect(() => {
    if (mode !== 'schedule') resetScrub();
  }, [mode, resetScrub]);

  const previewInstant = useMemo(() => new Date(now.getTime() + scrubOffsetMs), [now, scrubOffsetMs]);

  const handleChangeInstant = useCallback(
    (instant: Date) => setOffsetMs(instant.getTime() - now.getTime()),
    [setOffsetMs, now],
  );

  const centerContent =
    mode === 'edit' ? (
      <AddLocationForm
        existingIds={[config.home.id, ...config.rings.map((location) => location.id)]}
        onAdd={addLocation}
        onCancel={exitEditMode}
      />
    ) : mode === 'schedule' ? (
      <ScheduleForm
        previewInstant={previewInstant}
        onChangeInstant={handleChangeInstant}
        existingMeetingIds={config.meetings.map((meeting) => meeting.id)}
        onScheduled={addMeeting}
        onCancel={exitScheduleMode}
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
      previewOffsetMs={mode === 'schedule' ? scrubOffsetMs : 0}
      scrubBind={mode === 'schedule' ? scrubBind : undefined}
      isScrubbing={isScrubbing}
    />
  );
}

export default App;
