// Collision layers + interaction-group matrix. Shared so client and (v4) server use identical
// masks. `groupsFor(layer)` returns the packed 32-bit value Rapier expects on
// collider.collisionGroups / interactionGroups — computed here WITHOUT importing rapier so
// this package stays dependency-free.

export enum Layer {
  WORLD = 0,
  PLAYER = 1,
  VEHICLE = 2,
  PED = 3,
  PROJECTILE = 4,
  TRIGGER = 5,
  PROP = 6,
  WATER = 7,
}

// Keep symmetric: if A lists B, B must list A (except intentional one-way like TRIGGER).
const COLLIDES_WITH: Record<Layer, Layer[]> = {
  [Layer.WORLD]: [Layer.PLAYER, Layer.VEHICLE, Layer.PED, Layer.PROJECTILE, Layer.PROP],
  [Layer.PLAYER]: [
    Layer.WORLD,
    Layer.VEHICLE,
    Layer.PED,
    Layer.PROP,
    Layer.PROJECTILE,
    Layer.TRIGGER,
    Layer.WATER,
  ],
  [Layer.VEHICLE]: [
    Layer.WORLD,
    Layer.PLAYER,
    Layer.PED,
    Layer.VEHICLE,
    Layer.PROP,
    Layer.PROJECTILE,
    Layer.TRIGGER,
    Layer.WATER,
  ],
  [Layer.PED]: [Layer.WORLD, Layer.PLAYER, Layer.VEHICLE, Layer.PROP, Layer.PROJECTILE, Layer.WATER], // no PED<->PED
  [Layer.PROJECTILE]: [Layer.WORLD, Layer.PLAYER, Layer.VEHICLE, Layer.PED, Layer.PROP], // no self
  [Layer.TRIGGER]: [Layer.PLAYER, Layer.VEHICLE],
  [Layer.PROP]: [
    Layer.WORLD,
    Layer.PLAYER,
    Layer.VEHICLE,
    Layer.PED,
    Layer.PROJECTILE,
    Layer.PROP,
  ],
  [Layer.WATER]: [Layer.PLAYER, Layer.VEHICLE, Layer.PED],
};

const toBitmask = (groups: number | number[]): number =>
  Array.isArray(groups) ? groups.reduce((m, g) => m | (1 << g), 0) : groups;

/** Pack membership + filter groups into Rapier's 32-bit interaction-groups value. */
export const interactionGroups = (
  memberships: number | number[],
  filters: number | number[],
): number => ((toBitmask(memberships) << 16) | toBitmask(filters)) >>> 0;

/** Interaction groups for a collider that belongs to `layer`. */
export const groupsFor = (layer: Layer): number =>
  interactionGroups([layer], COLLIDES_WITH[layer]);
