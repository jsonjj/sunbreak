import type { SimEntity } from "@sunbreak/shared";
import type * as THREE from "three";
import type { RapierRigidBody } from "@react-three/rapier";

/** View components — live object refs, client-only, NEVER serialized. */
export interface ViewComponents {
  three: THREE.Object3D;
  rigidBody: RapierRigidBody;
  mixer: THREE.AnimationMixer;
  interpolation: { prev: THREE.Vector3; next: THREE.Vector3 };
}

/**
 * A client entity is a sim entity plus optional view components.
 *
 * To add ECS fields, augment the shared `SimComponents` interface from your OWN subsystem
 * file (see the contract in `@sunbreak/shared` → `ecs/components.ts`); those flow in here via
 * `SimEntity` automatically. Reuse the view components above where you can. Do NOT edit this
 * central file.
 */
export type ClientEntity = SimEntity & Partial<ViewComponents>;
