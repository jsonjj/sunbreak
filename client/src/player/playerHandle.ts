import type { RapierRigidBody } from "@react-three/rapier";

/** Shared handle to the local player's physics body (consumed by the camera + others). */
export const playerHandle: { body: RapierRigidBody | null } = {
  body: null,
};
