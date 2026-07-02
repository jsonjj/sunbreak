// The ordered, data-driven station registry. Add a station by importing its config and pushing
// it into `STATIONS` — the engine, store, wheel and input all derive from this single list.
import type { StationDef } from "../types";
import { sol96 } from "./sol96";
import { sunset84 } from "./sunset84";
import { gutterGold } from "./gutterGold";
import { theReef } from "./theReef";
import { velvet92 } from "./velvet92";
import { staticPalms } from "./staticPalms";

/** Broadcast order shown on the station wheel (index 0 = default station). */
export const STATIONS: readonly StationDef[] = [
  sol96,
  sunset84,
  gutterGold,
  theReef,
  velvet92,
  staticPalms,
] as const;

export const STATION_COUNT = STATIONS.length;

export const DEFAULT_STATION_ID = STATIONS[0]?.id ?? null;

const BY_ID = new Map<string, StationDef>(STATIONS.map((s) => [s.id, s]));

export function getStation(id: string | null | undefined): StationDef | undefined {
  return id == null ? undefined : BY_ID.get(id);
}

export function stationIndexOf(id: string | null | undefined): number {
  if (id == null) return -1;
  return STATIONS.findIndex((s) => s.id === id);
}

/** Clamp/wrap an arbitrary index into a valid station index (wraps both directions). */
export function wrapStationIndex(index: number): number {
  if (STATION_COUNT === 0) return 0;
  return ((index % STATION_COUNT) + STATION_COUNT) % STATION_COUNT;
}

export { RADIO_ATTRIBUTION } from "./attribution";
