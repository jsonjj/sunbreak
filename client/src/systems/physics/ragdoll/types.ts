// physics/ragdoll — shared types for the passive-jointed ragdoll + hit-reaction subsystem.
//
// Rapier reality check (see gta6-build/02-physics/ragdoll.md): as of @dimforge/rapier3d-compat
// 0.19.2 (bundled by @react-three/rapier 2.2.0) spherical-joint MOTORS are not exposed to WASM
// (dimforge/rapier #791), so this is a PASSIVE jointed ragdoll (+ impulse/torque reactions),
// never a motor-driven active ragdoll.

import type { Vec3Tuple } from "@sunbreak/shared";
import type { RapierContext, RapierRigidBody } from "@react-three/rapier";

// ── Rapier handle/type aliases ───────────────────────────────────────────────
// We deliberately DO NOT import "@dimforge/rapier3d-compat" directly — it is a transitive dep
// of @react-three/rapier, not a declared client dependency. Everything we need is reachable
// through the (typed) RapierContext, and the RAPIER namespace object is handed to us at runtime
// by <RagdollBridge> via useRapier().
export type RapierNamespace = RapierContext["rapier"];
export type RapierWorld = RapierContext["world"];
export type RapierBody = RapierRigidBody;
export type RapierImpulseJoint = ReturnType<RapierWorld["createImpulseJoint"]>;

// ── Rig taxonomy ─────────────────────────────────────────────────────────────
/** The 11 bodies of the full humanoid rig. Reduced rigs use a subset. */
export type BoneId =
  | "pelvis"
  | "chest"
  | "head"
  | "armL"
  | "foreL"
  | "armR"
  | "foreR"
  | "thighL"
  | "shinL"
  | "thighR"
  | "shinR";

/** LOD tier: 0 = full 11-body rig, 1 = reduced 6-body rig, 2 = single-capsule flop / canned. */
export type RagdollTier = 0 | 1 | 2;

/** Lifecycle of a ragdolling entity (mirrored onto `ragdoll_state`). */
export type RagdollPhase =
  | "pending" // tagged, waiting for the shared Rapier world (bridge not attached yet)
  | "activating" // pose copied into bodies, blending anim → physics
  | "simulating" // free physics simulation
  | "settling" // low velocity, counting down to settled
  | "settled" // came to rest
  | "powered" // alive: only the struck limb is dynamic (partial reaction)
  | "gettingUp" // survivable knockdown → hand back to animation (seam)
  | "corpse" // lethal + settled, lingering before despawn
  | "releasing"; // rig returned to the pool this frame

/** Severity of an incoming hit (combat → us). */
export type HitType = "flinch" | "stagger" | "knockdown" | "death";

export interface RigBody {
  id: BoneId;
  /** Mixamo bone name this body drives, e.g. "mixamorigLeftArm". */
  bone: string;
  /** Capsule half-height (along local Y), metres. */
  half: number;
  /** Capsule radius, metres. */
  radius: number;
  /** Body mass, kg (full rig sums to ~75kg). */
  mass: number;
}

export interface RigJoint {
  a: BoneId;
  b: BoneId;
  type: "spherical" | "revolute";
  /** Anchor in body A local space. */
  anchorA: Vec3Tuple;
  /** Anchor in body B local space. */
  anchorB: Vec3Tuple;
  /** Revolute hinge axis (local). */
  axis?: Vec3Tuple;
  /** Revolute angular limits [min,max] in radians. */
  limits?: [number, number];
}

export interface RigSpec {
  tier: RagdollTier;
  rootBone: BoneId;
  bodies: RigBody[];
  joints: RigJoint[];
  /** Bodies (excluding root) ordered parent-before-child for top-down bone sync. */
  childOrder: BoneId[];
}

/** A built, poolable ragdoll instance living on the shared Rapier world. */
export interface RigInstance {
  tier: RagdollTier;
  spec: RigSpec;
  bodies: Partial<Record<BoneId, RapierBody>>;
  joints: RapierImpulseJoint[];
  inUse: boolean;
  /** Stable pool slot, used to space parked rigs apart off-world. */
  slot: number;
}

// ── Combat → ragdoll contract ────────────────────────────────────────────────
/**
 * Everything combat needs to describe an impact. This is the #1 upstream contract.
 * `dir` is a (roughly) unit world-space direction; `magnitude` scales it into an impulse
 * (kg·m/s). `point` is the world-space contact point (defaults to the struck body centre).
 */
export interface HitReactionParams {
  bone: BoneId;
  dir: Vec3Tuple;
  magnitude: number;
  point?: Vec3Tuple;
  type: HitType;
  lethal?: boolean;
}

/** The ECS request component combat writes onto an entity (`ragdoll_hit`). */
export type RagdollHitRequest = HitReactionParams;

/**
 * Compact, seed-based replication event (v4 netcode). Kept local for now because
 * `@sunbreak/shared` is frozen during the wave; the integrator can lift this into
 * `shared/src/ragdoll/types.ts` when shared is unfrozen. We never stream bone state.
 */
export interface RagdollNetEvent {
  entityId: number; // netId
  bone: BoneId;
  impulse: Vec3Tuple;
  point: Vec3Tuple;
  lethal: boolean;
  seed: number;
}
