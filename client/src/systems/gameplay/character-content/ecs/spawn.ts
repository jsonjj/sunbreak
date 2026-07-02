// ECS integration for characters. Reuses the shared VIEW components (`three`, `mixer`) so visuals
// render through the ECS↔R3F bridge (see CharacterView.tsx) instead of being hand-mounted into the
// scene. The live animator handle is kept in a module WeakMap (it is NOT serializable, so it must
// not live on the entity), keyed by entity.

import "../char.components";
import type { ClientEntity } from "@/ecs/clientEntity";
import { world } from "@/ecs/world";
import { createCharacter } from "../createCharacter";
import { isLeadId } from "../leads/leadDefs";
import type { CharacterInstance, CharacterKindInput, CreateCharacterOptions } from "../types";

/** Entity -> live animator/model handle. WeakMap so removed entities are GC'd. */
const handles = new WeakMap<ClientEntity, CharacterInstance>();

export function getCharacterInstance(entity: ClientEntity): CharacterInstance | undefined {
  return handles.get(entity);
}

export interface AttachOptions {
  /** Vertical offset applied when the drive system syncs the feet-origin model to transform. */
  yOffset?: number;
}

/** Attach a built character to an (existing) entity: sets three/mixer view comps + char_* data. */
export function attachCharacter(
  entity: ClientEntity,
  instance: CharacterInstance,
  options: AttachOptions = {},
): void {
  handles.set(entity, instance);

  setOrAdd(entity, "three", instance.object3D);
  setOrAdd(entity, "mixer", instance.mixer);
  setOrAdd(entity, "char_kind", instance.kind);
  setOrAdd(entity, "char_appearance", instance.appearance);
  setOrAdd(entity, "char_anim", instance.current);
  if (options.yOffset !== undefined) setOrAdd(entity, "char_yOffset", options.yOffset);
  if (isLeadId(instance.kind) && entity.char_isLead === undefined) {
    world.addComponent(entity, "char_isLead", true);
  }
  if (entity.char_ready === undefined) world.addComponent(entity, "char_ready", true);
}

/** Create + attach in one step. Useful for peds/tests; controllers may prefer attachCharacter. */
export interface SpawnOptions extends CreateCharacterOptions {
  position?: readonly [number, number, number];
  yaw?: number;
  isPed?: boolean;
  yOffset?: number;
}

export function spawnCharacterEntity(
  kind: CharacterKindInput,
  opts: SpawnOptions = {},
): { entity: ClientEntity; instance: CharacterInstance } {
  const instance = createCharacter(kind, opts);
  const p = opts.position ?? [0, 0, 0];
  const entity: ClientEntity = {
    transform: {
      position: { x: p[0], y: p[1], z: p[2] },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    movement: { speed: 0, normalizedSpeed: 0, mode: "idle", grounded: true, facing: opts.yaw ?? 0 },
  };
  if (opts.isPed) entity.isPed = true;
  world.add(entity);
  attachCharacter(entity, instance, { yOffset: opts.yOffset });
  return { entity, instance };
}

/** Detach + dispose a character from an entity (keeps shared geometry/materials). */
export function detachCharacter(entity: ClientEntity): void {
  const inst = handles.get(entity);
  if (inst) inst.dispose();
  handles.delete(entity);
  for (const c of ["three", "mixer", "char_ready"] as const) {
    if (entity[c] !== undefined) world.removeComponent(entity, c);
  }
}

/** Subscribe to entity removal so character handles are disposed. Returns an unsubscribe fn. */
export function installCharacterLifecycle(): () => void {
  return world.onEntityRemoved.subscribe((entity: ClientEntity) => {
    const inst = handles.get(entity);
    if (inst) inst.dispose();
    handles.delete(entity);
  });
}

function setOrAdd<C extends keyof ClientEntity>(
  entity: ClientEntity,
  component: C,
  value: NonNullable<ClientEntity[C]>,
): void {
  if (entity[component] === undefined) {
    world.addComponent(entity, component, value);
  } else {
    entity[component] = value;
  }
}
