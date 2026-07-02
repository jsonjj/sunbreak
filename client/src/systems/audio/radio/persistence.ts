// Last-station / power / volume persistence (localStorage). v4 can swap this for a SQLite-backed
// endpoint; the shape stays the same. Reads are defensive (never throw on private-mode/quota).
import { STATIONS, stationIndexOf, wrapStationIndex } from "./stations";
import { useRadioStore } from "./radioStore";

const KEY = "sunbreak.radio";

interface PersistedRadio {
  stationId: string | null;
  powerPref: boolean;
  volume: number;
}

function read(): PersistedRadio | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedRadio>;
    return {
      stationId: typeof parsed.stationId === "string" ? parsed.stationId : null,
      powerPref: !!parsed.powerPref,
      volume: typeof parsed.volume === "number" ? parsed.volume : 0.9,
    };
  } catch {
    return null;
  }
}

function write(data: PersistedRadio): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore (private mode / quota) */
  }
}

/** Load persisted radio prefs into the store on boot. */
export function loadRadioPersistence(): void {
  const saved = read();
  if (!saved) return;
  const idx = stationIndexOf(saved.stationId);
  useRadioStore.getState()._mirror({ stationIndex: idx >= 0 ? idx : 0 });
  useRadioStore.setState({
    powerPref: saved.powerPref,
    volume: saved.volume,
  });
}

/** Subscribe to persist station/power/volume changes; returns an unsubscribe fn. */
export function installRadioPersistence(): () => void {
  return useRadioStore.subscribe(
    (s) => ({ stationIndex: s.stationIndex, powerPref: s.powerPref, volume: s.volume }),
    ({ stationIndex, powerPref, volume }) => {
      const station = STATIONS[wrapStationIndex(stationIndex)];
      write({ stationId: station?.id ?? null, powerPref, volume });
    },
    { equalityFn: (a, b) => a.stationIndex === b.stationIndex && a.powerPref === b.powerPref && a.volume === b.volume },
  );
}
