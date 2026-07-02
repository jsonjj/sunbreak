// content/data-format — schema barrel + kind registry.
//
// Re-exports every schema (and its colocated `z.infer` type) and defines the canonical
// `kind → schema` registry used by the generic loader, the ref-integrity pass, and any
// future validate CLI / editor.
import type { z } from "zod";

export * from "./primitives";
export * from "./map";
export * from "./vehicle";
export * from "./weapon";
export * from "./npc";
export * from "./mission";

import { MapChunk } from "./map";
import { Vehicle } from "./vehicle";
import { Weapon } from "./weapon";
import { Npc } from "./npc";
import { Mission } from "./mission";

/** The single source of truth: content kind → zod schema. */
export const CONTENT_SCHEMAS = {
  map: MapChunk,
  vehicle: Vehicle,
  weapon: Weapon,
  npc: Npc,
  mission: Mission,
} as const;

/** Union of authorable content kinds: `"map" | "vehicle" | "weapon" | "npc" | "mission"`. */
export type ContentKind = keyof typeof CONTENT_SCHEMAS;

/** Runtime list of all content kinds. */
export const CONTENT_KINDS = Object.keys(CONTENT_SCHEMAS) as ContentKind[];

/** Inferred (output) document type for a given kind. */
export type ContentOf<K extends ContentKind> = z.infer<(typeof CONTENT_SCHEMAS)[K]>;

/** Authoring (input) document type for a given kind — fields with defaults are optional. */
export type ContentInput<K extends ContentKind> = z.input<(typeof CONTENT_SCHEMAS)[K]>;

// Per-kind authoring input aliases (used with `satisfies` in hand-authored catalogs).
export type MapChunkInput = z.input<typeof MapChunk>;
export type VehicleInput = z.input<typeof Vehicle>;
export type WeaponInput = z.input<typeof Weapon>;
export type NpcInput = z.input<typeof Npc>;
export type MissionInput = z.input<typeof Mission>;

/** kind → the `schema` discriminant literal stamped on documents. */
export const SCHEMA_ID_BY_KIND = {
  map: "sunbreak.map",
  vehicle: "sunbreak.vehicle",
  weapon: "sunbreak.weapon",
  npc: "sunbreak.npc",
  mission: "sunbreak.mission",
} as const satisfies Record<ContentKind, string>;

/** `schema` discriminant literal → kind (for auto-detecting a document's kind). */
export const KIND_BY_SCHEMA_ID: Readonly<Record<string, ContentKind>> = {
  "sunbreak.map": "map",
  "sunbreak.vehicle": "vehicle",
  "sunbreak.weapon": "weapon",
  "sunbreak.npc": "npc",
  "sunbreak.mission": "mission",
};
