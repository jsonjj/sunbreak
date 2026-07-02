// content/data-format — types-only entrypoint.
//
// Every type here is a `z.infer` of a schema, colocated with that schema in `schemas/*`.
// This module re-exports them for consumers that want types WITHOUT pulling zod schema
// values into their import (e.g. type-only imports in hot render code). The schema values
// are available from the package root or `./schemas`.
export type {
  // primitives
  Vec3,
  Vec2,
  Quat,
  EulerDeg,
  Id,
  AssetRef,
  HexColor,
  Transform,
  Bounds,
  // map
  ColliderKind,
  Prop,
  SpawnKind,
  SpawnPoint,
  PoiKind,
  Poi,
  RoadNode,
  RoadType,
  RoadSegment,
  District,
  Zone,
  MapChunk,
  // vehicle
  VehicleClass,
  DriveType,
  Suspension,
  Handling,
  Vehicle,
  // weapon
  WeaponCategory,
  WeaponSlot,
  FireMode,
  Weapon,
  // npc
  NpcArchetype,
  NpcBehavior,
  TimeOfDay,
  Npc,
  // mission
  MissionArchetype,
  ObjectiveType,
  Objective,
  Trigger,
  Medal,
  Rewards,
  Mission,
  // registry
  ContentKind,
  ContentOf,
} from "./schemas";
