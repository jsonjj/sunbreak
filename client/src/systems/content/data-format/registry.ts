// content/data-format — in-memory content registry.
//
// Because this subsystem owns a single client folder (no top-level `/content` tree), authored
// content is registered here at boot (see `content/`) and queried by consumers at runtime.
// Every `register*` validates via the zod schema before storing, so the registry only ever
// holds well-formed, fully-defaulted documents. Getters are cheap Map lookups.
import type { z } from "zod";
import {
  CONTENT_KINDS,
  CONTENT_SCHEMAS,
  type ContentKind,
  MapChunk,
  Mission,
  Npc,
  Vehicle,
  Weapon,
} from "./schemas";

type EnvelopeDoc = { id: string; schema: string; schemaVersion: number };

const stores = {
  map: new Map<string, MapChunk>(),
  vehicle: new Map<string, Vehicle>(),
  weapon: new Map<string, Weapon>(),
  npc: new Map<string, Npc>(),
  mission: new Map<string, Mission>(),
} as const;

// ── Vehicles ─────────────────────────────────────────────────────────────────
export const registerVehicle = (def: z.input<typeof Vehicle>): Vehicle => {
  const v = Vehicle.parse(def);
  stores.vehicle.set(v.id, v);
  return v;
};
export const getVehicle = (id: string): Vehicle | undefined => stores.vehicle.get(id);
export const allVehicles = (): Vehicle[] => [...stores.vehicle.values()];
export const hasVehicle = (id: string): boolean => stores.vehicle.has(id);

// ── Weapons ──────────────────────────────────────────────────────────────────
export const registerWeapon = (def: z.input<typeof Weapon>): Weapon => {
  const w = Weapon.parse(def);
  stores.weapon.set(w.id, w);
  return w;
};
export const getWeapon = (id: string): Weapon | undefined => stores.weapon.get(id);
export const allWeapons = (): Weapon[] => [...stores.weapon.values()];
export const hasWeapon = (id: string): boolean => stores.weapon.has(id);

// ── NPCs ─────────────────────────────────────────────────────────────────────
export const registerNpc = (def: z.input<typeof Npc>): Npc => {
  const n = Npc.parse(def);
  stores.npc.set(n.id, n);
  return n;
};
export const getNpc = (id: string): Npc | undefined => stores.npc.get(id);
export const allNpcs = (): Npc[] => [...stores.npc.values()];
export const hasNpc = (id: string): boolean => stores.npc.has(id);

// ── Missions ─────────────────────────────────────────────────────────────────
export const registerMission = (def: z.input<typeof Mission>): Mission => {
  const m = Mission.parse(def);
  stores.mission.set(m.id, m);
  return m;
};
export const getMission = (id: string): Mission | undefined => stores.mission.get(id);
export const allMissions = (): Mission[] => [...stores.mission.values()];
export const hasMission = (id: string): boolean => stores.mission.has(id);

// ── Maps ─────────────────────────────────────────────────────────────────────
export const registerMap = (def: z.input<typeof MapChunk>): MapChunk => {
  const m = MapChunk.parse(def);
  stores.map.set(m.id, m);
  return m;
};
/** Alias matching the spec's loader API name. */
export const loadMap = (id: string): MapChunk | undefined => stores.map.get(id);
export const getMap = (id: string): MapChunk | undefined => stores.map.get(id);
export const allMaps = (): MapChunk[] => [...stores.map.values()];
export const hasMap = (id: string): boolean => stores.map.has(id);

// ── Generic (kind-dispatched) ─────────────────────────────────────────────────
/** Validate `raw` against the schema for `kind` and store it. Throws on invalid input. */
export const registerContent = (kind: ContentKind, raw: unknown): void => {
  const doc = CONTENT_SCHEMAS[kind].parse(raw) as EnvelopeDoc;
  (stores[kind] as Map<string, EnvelopeDoc>).set(doc.id, doc);
};

export const getContentIds = (kind: ContentKind): string[] => [
  ...(stores[kind] as Map<string, unknown>).keys(),
];

/** Remove all registered content (useful for tests / HMR). */
export const clearRegistry = (): void => {
  for (const kind of CONTENT_KINDS) (stores[kind] as Map<string, unknown>).clear();
};

export interface ManifestEntry {
  kind: ContentKind;
  id: string;
  schema: string;
  schemaVersion: number;
}

/** A flat index of everything currently registered — mirrors the spec's `manifest.json`. */
export const getManifest = (): ManifestEntry[] => {
  const out: ManifestEntry[] = [];
  for (const kind of CONTENT_KINDS) {
    for (const doc of (stores[kind] as Map<string, EnvelopeDoc>).values()) {
      out.push({ kind, id: doc.id, schema: doc.schema, schemaVersion: doc.schemaVersion });
    }
  }
  return out;
};
