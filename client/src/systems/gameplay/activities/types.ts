// Activities & Minigames — data-driven framework contracts (client-owned).
//
// These are the authoring + runtime types for the Activity framework. Activity content is
// authored as plain data (see ./data/*), validated at load by ./schema.ts (zod), and executed
// by the runtime FSM (./runtime) via per-kind controllers (./kinds).
//
// We deliberately keep these decoupled from sibling subsystems: rewards, blips and triggering
// all flow through injectable ports (./ports) so this subsystem is fully playable today and
// auto-upgrades when Interaction / Economy / Map land.

import type { Vec3Tuple } from "@sunbreak/shared";

export type ActivityKind = "race" | "rampage" | "delivery";

/** Objective node roles a kind controller can spawn into the ECS world. */
export type NodeRole = "checkpoint" | "target" | "pickup" | "dropoff";

// ─────────────────────────────────────────────────────────────────────────────
// ECS component payloads (augmented onto SimComponents in ./activities.components.ts)
// ─────────────────────────────────────────────────────────────────────────────

/** A persistent world marker that offers an activity when the player is nearby. */
export interface ActivityMarkerData {
  activityId: string;
  radius: number;
}

/** A transient objective node spawned for the duration of a run. */
export interface ActivityNodeData {
  runId: string;
  role: NodeRole;
  index: number;
  radius: number;
  /** Points awarded (rampage) / payout (delivery leg) when satisfied. */
  value?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rewards
// ─────────────────────────────────────────────────────────────────────────────

/** What a completion grants. Routed through the Economy port. */
export interface RewardSpec {
  cash?: number;
  /** true → route to the dirty-cash wallet (Economy decides how). */
  dirty?: boolean;
  /** skillId → xp (skillId kept as a string to avoid coupling to Economy's SkillId enum). */
  skillXp?: Record<string, number>;
  unlockId?: string;
}

/** Tiered payouts. Authored best→worst; the first tier the run qualifies for wins. */
export interface RewardTier {
  label: string;
  /** rampage/score: require score ≥ minScore. */
  minScore?: number;
  /** race/delivery: require elapsed ≤ maxTimeMs. */
  maxTimeMs?: number;
  reward: RewardSpec;
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity definitions (discriminated by `kind`)
// ─────────────────────────────────────────────────────────────────────────────

interface BaseActivityDef {
  id: string;
  name: string;
  kind: ActivityKind;
  /** Free-form region tag (World subsystem owns the canonical RegionId enum). */
  region?: string;
  /** Marker / trigger position in world space (X/Z ground plane, Y up). */
  origin: Vec3Tuple;
  /** Trigger radius for the activity giver marker. */
  markerRadius?: number;
  /** Base reward; overridden by a matching tier if `rewardTiers` is present. */
  reward: RewardSpec;
  rewardTiers?: RewardTier[];
  /** Cooldown before the activity can be replayed. */
  cooldownMs?: number;
  /** Go! countdown before the clock starts. */
  countdownMs?: number;
  /** Overall time limit; run fails at 0. undefined = untimed. */
  timeLimitMs?: number;
  /** One-line pitch shown in the offer prompt. */
  blurb?: string;
}

export interface Checkpoint {
  pos: Vec3Tuple;
  radius?: number;
}

export interface RaceActivityDef extends BaseActivityDef {
  kind: "race";
  mode: "sprint" | "circuit";
  /** Circuit laps (default 1). Sprints are always 1. */
  laps?: number;
  checkpoints: Checkpoint[];
  /** Optional flavour: require the player to be in a vehicle (consumed by Vehicles later). */
  requireVehicle?: boolean;
}

export interface RampageTarget {
  pos: Vec3Tuple;
  radius?: number;
  /** Score value for this target (default 1). */
  value?: number;
}

export interface RampageActivityDef extends BaseActivityDef {
  kind: "rampage";
  /** Score needed to succeed. */
  goal: number;
  targets: RampageTarget[];
  /** Re-arm all targets when the batch is cleared (endless within the time limit). */
  respawn?: boolean;
}

export interface DeliveryLeg {
  pickup: Vec3Tuple;
  dropoff: Vec3Tuple;
  radius?: number;
  payout?: number;
}

export interface DeliveryActivityDef extends BaseActivityDef {
  kind: "delivery";
  legs: DeliveryLeg[];
}

export type ActivityDef = RaceActivityDef | RampageActivityDef | DeliveryActivityDef;

// ─────────────────────────────────────────────────────────────────────────────
// Run state
// ─────────────────────────────────────────────────────────────────────────────

export type RunState =
  | "dormant"
  | "offered"
  | "countdown"
  | "active"
  | "succeeded"
  | "failed"
  | "rewarding"
  | "cooldown";

export interface RunResult {
  activityId: string;
  runId: string;
  success: boolean;
  score: number;
  elapsedMs: number;
  tier?: string;
  reward: RewardSpec;
}
