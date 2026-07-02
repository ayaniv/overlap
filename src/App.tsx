import { WorldClock } from './clock/WorldClock';
import { DEFAULT_HOME_CITY, DEFAULT_WORK_END, DEFAULT_WORK_START, DEFAULT_WORLD_CITIES } from './clock/defaultCities';
import { useNow } from './hooks/useNow';

function App() {
  const now = useNow();

  return (
    <WorldClock
      now={now}
      homeCity={DEFAULT_HOME_CITY}
      worldCities={DEFAULT_WORLD_CITIES}
      workStart={DEFAULT_WORK_START}
      workEnd={DEFAULT_WORK_END}
    />
  );
}

export default App;
