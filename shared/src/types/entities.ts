// Cross-boundary entity identity + asset-reference enums. The Assets subsystem resolves
// VehicleId / WeaponId / PedArchetype against manifests keyed by these enums.

export enum EntityKind {
  Player = "player",
  Vehicle = "vehicle",
  Ped = "ped",
  Projectile = "projectile",
  Prop = "prop",
}

/** Branded string id; use `asEntityId()` to construct. */
export type EntityId = string & { readonly __brand: "EntityId" };
export const asEntityId = (id: string): EntityId => id as EntityId;

/** The two playable leads (Santa Vista). */
export enum CharacterId {
  Cami = "cami",
  Mac = "mac",
}

export enum WeaponId {
  Unarmed = "unarmed",
  Fists = "fists",
  Pistol = "pistol",
  Rifle = "rifle",
  Shotgun = "shotgun",
  Smg = "smg",
}

export enum VehicleId {
  Sedan = "sedan",
  Coupe = "coupe",
  Suv = "suv",
  Truck = "truck",
  Sports = "sports",
  Police = "police",
}

export enum PedArchetype {
  Civilian = "civilian",
  Business = "business",
  Tourist = "tourist",
  Gangster = "gangster",
  Police = "police",
}

/** 0 (clean) .. 5 (maximum heat). */
export type WantedLevel = 0 | 1 | 2 | 3 | 4 | 5;
