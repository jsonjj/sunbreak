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

/** A client entity is a sim entity plus optional view components. */
export type ClientEntity = SimEntity & Partial<ViewComponents>;
