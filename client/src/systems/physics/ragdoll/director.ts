// physics/ragdoll — the ECS orchestrator (singleton).
//
// Owns the pool + LOD governor + per-entity lifecycle. Driven every frame by the registered
// update/render systems (see index.ts); the shared Rapier world + physics-step timing arrive via
// <RagdollBridge> (or attachRagdollWorld). Nothing here allocates on the hot path.

import * as THREE from "three";
import type { Query } from "miniplex";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { RagdollPool } from "./ragdollPool";
import { activateRig, silenceMixer } from "./activate";
import {
  findSkinnedMesh,
  resolveBones,
  syncSimple,
  syncSkinned,
  syncSkinnedBones,
} from "./boneSync";
import {
  allAsleep,
  classifyFacing,
  driveKinematicFromBones,
  isResting,
  prepareGetUp,
  type LiePose,
} from "./getUp";
import {
  beginPoweredLimb,
  classifyReaction,
  drivePoweredLimb,
  limbForBone,
  playAdditiveReaction,
  poweredLimbSyncBones,
  type Limb,
} from "./hitReactions";
import {
  ACTIVATE_BLEND_S,
  CORPSE_LINGER_S,
  DEATH_TOPPLE_IMPULSE,
  GETUP_S,
  scaledCaps,
  SETTLE_FRAMES,
  tierForDistance,
} from "./config";
import type {
  BoneId,
  HitReactionParams,
  RagdollPhase,
  RagdollTier,
  RapierNamespace,
  RapierWorld,
  RigInstance,
} from "./types";

type BoneRefs = Partial<Record<BoneId, THREE.Bone>>;

interface RagdollRuntime {
  entity: ClientEntity;
  rig: RigInstance | null;
  tier: RagdollTier;
  phase: RagdollPhase;
  timer: number;
  restFrames: number;
  lethal: boolean;
  root?: THREE.Object3D;
  mesh: THREE.SkinnedMesh | null;
  refs: BoneRefs;
  simple: boolean;
  poweredLimb: Limb | null;
  pendingHit?: HitReactionParams;
  pose?: LiePose;
  frozen: boolean; // settled corpse: stop per-frame bone sync
}

const POWERED_DURATION_S = 0.4;
const _playerPos = new THREE.Vector3();
const _entPos = new THREE.Vector3();

type SettleListener = (entity: ClientEntity, lethal: boolean) => void;

class RagdollDirector {
  private rapier: RapierNamespace | null = null;
  private rworld: RapierWorld | null = null;
  private pool = new RagdollPool();
  private runtimes = new Map<ClientEntity, RagdollRuntime>();
  private hasBridge = false;

  private deadQuery: Query<ClientEntity> | null = null;
  private hitQuery: Query<ClientEntity> | null = null;
  private playerQuery: Query<ClientEntity> | null = null;

  private settleListeners = new Set<SettleListener>();
  private warnedNoWorld = false;

  // ── wiring ────────────────────────────────────────────────────────────────
  /** Lazily create the (cached) trigger queries. Safe to call every frame. */
  private ensureQueries(): void {
    if (this.deadQuery) return;
    this.deadQuery = world.with("isDead").without("ragdoll_state") as unknown as Query<ClientEntity>;
    this.hitQuery = world.with("ragdoll_hit") as unknown as Query<ClientEntity>;
    this.playerQuery = world.with("isPlayer", "transform") as unknown as Query<ClientEntity>;
  }

  /** Called by <RagdollBridge> (or attachRagdollWorld). Builds the pool once. */
  attachWorld(rapier: RapierNamespace, rworld: RapierWorld, fromBridge = false): void {
    this.rapier = rapier;
    this.rworld = rworld;
    if (fromBridge) this.hasBridge = true;
    if (!this.pool.isBuilt) this.pool.build(rapier, rworld, scaledCaps());
  }

  detachWorld(): void {
    for (const rt of this.runtimes.values()) this.cleanup(rt, false);
    this.runtimes.clear();
    this.pool.teardown();
    this.rapier = null;
    this.rworld = null;
    this.hasBridge = false;
  }

  onSettled(listener: SettleListener): () => void {
    this.settleListeners.add(listener);
    return () => this.settleListeners.delete(listener);
  }

  isRagdolling(entity: ClientEntity): boolean {
    const rt = this.runtimes.get(entity);
    return !!rt && rt.phase !== "gettingUp" && rt.phase !== "powered";
  }

  // ── public triggers (imperative API mirrors the ECS components) ─────────────
  triggerRagdoll(entity: ClientEntity, hit?: HitReactionParams): void {
    const lethal = hit?.type === "death" || hit?.lethal === true || !hit;
    this.startRagdoll(entity, hit, lethal);
  }

  triggerHitReaction(entity: ClientEntity, hit: HitReactionParams): void {
    this.handleHit(entity, hit);
  }

  // ── per-frame entry points (called by registered systems / bridge) ──────────
  /** update phase: scan triggers + advance the lifecycle. */
  update(dt: number): void {
    this.ensureQueries();
    this.processTriggers();
    this.advance(dt);
  }

  /** render phase fallback: if no bridge drives afterPhysics, sync here. */
  renderSync(): void {
    if (!this.hasBridge && this.rworld) this.syncActive();
  }

  /** Rapier before-step (bridge only): drive kinematic followers (get-up / powered limb). */
  beforePhysics(): void {
    for (const rt of this.runtimes.values()) {
      if (!rt.rig) continue;
      if (rt.phase === "gettingUp" && !rt.simple) driveKinematicFromBones(rt.rig, rt.refs);
      else if (rt.phase === "powered" && rt.poweredLimb) drivePoweredLimb(rt.rig, rt.refs, rt.poweredLimb);
    }
  }

  /** Rapier after-step (bridge only): post-solve bone sync. */
  afterPhysics(): void {
    if (this.hasBridge) this.syncActive();
  }

  // ── trigger scanning ────────────────────────────────────────────────────────
  private processTriggers(): void {
    // Deaths: any newly-dead humanoid that we aren't already tracking.
    if (this.deadQuery) {
      for (const entity of this.deadQuery) {
        if (this.runtimes.has(entity)) continue;
        if (!this.isHumanoid(entity)) continue;
        this.startRagdoll(entity, undefined, true);
      }
    }
    // Impacts: combat writes a `ragdoll_hit` request; consume it.
    if (this.hitQuery) {
      // Snapshot to a temp list since we mutate the query (removeComponent) while iterating.
      for (const entity of [...this.hitQuery]) {
        const hit = entity.ragdoll_hit;
        world.removeComponent(entity, "ragdoll_hit");
        if (hit) this.handleHit(entity, hit);
      }
    }
  }

  private handleHit(entity: ClientEntity, hit: HitReactionParams): void {
    const strategy = classifyReaction(hit.type);
    if (strategy === "ragdoll") {
      this.startRagdoll(entity, hit, hit.type === "death" || hit.lethal === true);
      return;
    }
    if (strategy === "powered") {
      if (this.tryPoweredLimb(entity, hit)) return;
      // Fall through to additive if a partial reaction wasn't possible.
    }
    // additive flinch (or powered fallback) — Animation subsystem clip seam.
    playAdditiveReaction(entity.mixer);
  }

  // ── ragdoll start / activation ──────────────────────────────────────────────
  private startRagdoll(entity: ClientEntity, hit: HitReactionParams | undefined, lethal: boolean): void {
    if (this.runtimes.has(entity)) return;
    const root = entity.three;
    const mesh = findSkinnedMesh(root);
    const rt: RagdollRuntime = {
      entity,
      rig: null,
      tier: mesh ? 0 : 2,
      phase: "pending",
      timer: 0,
      restFrames: 0,
      lethal,
      root,
      mesh,
      refs: {},
      simple: !mesh,
      poweredLimb: null,
      pendingHit: hit,
      frozen: false,
    };
    this.runtimes.set(entity, rt);

    // ECS mirror (this is the `ragdoll_active` tag the whole subsystem hangs off of).
    this.setTag(entity, "ragdoll_active");
    this.setState(entity, "pending");
    if (lethal) this.setTag(entity, "ragdoll_lethal");

    if (this.rapier && this.rworld) this.activateRuntime(rt);
    else if (!this.warnedNoWorld) {
      this.warnedNoWorld = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[ragdoll] tagged an entity but the Rapier world isn't attached yet — mount <RagdollBridge/> (or call attachRagdollWorld) inside <Physics>. Holding as pending.",
      );
    }
  }

  private activateRuntime(rt: RagdollRuntime): void {
    if (!this.rapier || !this.rworld) return;
    const rapier = this.rapier; // capture: narrowing is lost across the pool/helper calls below
    const caps = scaledCaps();
    const overCap =
      this.pool.activeJointedCount() >= caps.maxRagdolls ||
      this.pool.activeBodyCount() >= caps.maxAwakeBodies;

    let desired: RagdollTier = rt.mesh ? tierForDistance(this.distanceToPlayer(rt.entity)) : 2;
    if (overCap) desired = 2; // downgrade over-budget deaths to the cheap flop / canned path

    const rig = this.pool.acquire(desired);
    if (!rig) {
      // Pool exhausted → canned (no jointed sim). Lethal lingers as a corpse, else drop the tag.
      rt.rig = null;
      rt.tier = 2;
      rt.simple = true;
      rt.phase = rt.lethal ? "corpse" : "settled";
      rt.frozen = true;
      this.mirrorState(rt, -1);
      return;
    }

    rt.rig = rig;
    rt.tier = rig.tier;
    rt.simple = rig.tier === 2 || !rt.mesh;
    rt.refs = rt.mesh && rig.tier < 2 ? resolveBones(rt.mesh, rig.spec) : {};

    const seedVel = this.seedVelocity(rt.entity);
    const hit = rt.pendingHit ?? (rt.lethal ? this.toppleHit() : undefined);
    activateRig(rapier, rig, rt.refs, rt.root, seedVel, hit, rt.entity.transform);
    silenceMixer(rt.entity.mixer);

    rt.phase = "activating";
    rt.timer = 0;
    rt.restFrames = 0;
    rt.pendingHit = undefined;
    this.mirrorState(rt, rig.slot);
  }

  private tryPoweredLimb(entity: ClientEntity, hit: HitReactionParams): boolean {
    if (!this.rapier || !this.rworld) return false;
    if (this.runtimes.has(entity)) return false; // already reacting
    const rapier = this.rapier; // capture: narrowing is lost across the pool/helper calls below
    const mesh = findSkinnedMesh(entity.three);
    if (!mesh) return false;
    const limb = limbForBone(hit.bone);
    if (!limb) return false;
    const rig = this.pool.acquire(0) ?? this.pool.acquire(1);
    if (!rig || rig.tier === 2) {
      if (rig) this.pool.release(rig);
      return false;
    }
    const refs = resolveBones(mesh, rig.spec);
    const rt: RagdollRuntime = {
      entity,
      rig,
      tier: rig.tier,
      phase: "powered",
      timer: 0,
      restFrames: 0,
      lethal: false,
      root: entity.three,
      mesh,
      refs,
      simple: false,
      poweredLimb: limb,
      frozen: false,
    };
    beginPoweredLimb(rapier, rig, refs, limb, hit);
    this.runtimes.set(entity, rt);
    this.setTag(entity, "ragdoll_active");
    this.setState(entity, "powered");
    this.mirrorState(rt, rig.slot);
    return true;
  }

  // ── lifecycle advance ────────────────────────────────────────────────────────
  private advance(dt: number): void {
    for (const rt of this.runtimes.values()) {
      switch (rt.phase) {
        case "pending":
          if (this.rapier && this.rworld) this.activateRuntime(rt);
          break;

        case "activating":
          rt.timer += dt;
          if (rt.timer >= ACTIVATE_BLEND_S) {
            rt.phase = "simulating";
            this.setState(rt.entity, "simulating");
          }
          break;

        case "simulating": {
          if (!rt.rig) {
            rt.phase = "settled";
            break;
          }
          if (allAsleep(rt.rig) || isResting(rt.rig)) {
            rt.restFrames++;
            if (rt.restFrames >= SETTLE_FRAMES) {
              rt.phase = "settled";
              this.setState(rt.entity, "settled");
            }
          } else {
            rt.restFrames = 0;
          }
          break;
        }

        case "settled":
          if (rt.rig && !rt.simple) syncSkinned(rt.rig, rt.refs, rt.rig.spec);
          else if (rt.rig) syncSimple(rt.rig, rt.root, rt.entity.transform);
          rt.frozen = true; // freeze the final pose; corpses/rest cost ~0 from here
          this.emitSettled(rt);
          if (rt.lethal) {
            rt.phase = "corpse";
            rt.timer = 0;
            this.setState(rt.entity, "corpse");
          } else {
            rt.pose = rt.rig ? classifyFacing(rt.rig) : "back";
            if (this.rapier && rt.rig) prepareGetUp(this.rapier, rt.rig);
            rt.phase = "gettingUp";
            rt.timer = 0;
            rt.frozen = false;
            this.setState(rt.entity, "gettingUp");
            // Animation seam: start the pose-matched Mixamo get-up clip for `rt.pose` here.
          }
          break;

        case "powered":
          rt.timer += dt;
          if (rt.timer >= POWERED_DURATION_S) {
            this.cleanup(rt, true); // recombine: release limb, hand back to animation
          }
          break;

        case "gettingUp":
          rt.timer += dt;
          if (rt.timer >= GETUP_S) this.cleanup(rt, true); // control back to controller/anim
          break;

        case "corpse":
          rt.timer += dt;
          if (rt.timer >= CORPSE_LINGER_S) this.cleanup(rt, false);
          break;

        default:
          break;
      }
    }
  }

  // ── bone sync (called post-physics, or in render as a fallback) ───────────────
  private syncActive(): void {
    for (const rt of this.runtimes.values()) {
      if (!rt.rig || rt.frozen) continue;
      if (rt.phase === "powered" && rt.poweredLimb) {
        syncSkinnedBones(rt.rig, rt.refs, poweredLimbSyncBones(rt.poweredLimb));
      } else if (rt.phase === "simulating" || rt.phase === "activating" || rt.phase === "settling") {
        if (rt.simple) syncSimple(rt.rig, rt.root, rt.entity.transform);
        else syncSkinned(rt.rig, rt.refs, rt.rig.spec);
      }
    }
  }

  // ── teardown ──────────────────────────────────────────────────────────────────
  private cleanup(rt: RagdollRuntime, restoreControl: boolean): void {
    if (rt.rig) this.pool.release(rt.rig);
    this.runtimes.delete(rt.entity);
    const e = rt.entity;
    if (e.ragdoll_active) world.removeComponent(e, "ragdoll_active");
    if (e.ragdoll_lethal) world.removeComponent(e, "ragdoll_lethal");
    if (e.ragdoll_handle !== undefined) world.removeComponent(e, "ragdoll_handle");
    if (e.ragdoll_tier !== undefined) world.removeComponent(e, "ragdoll_tier");
    if (e.ragdoll_state !== undefined) world.removeComponent(e, "ragdoll_state");
    void restoreControl; // hook: AI/controller resumes when `ragdoll_active` disappears
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  private emitSettled(rt: RagdollRuntime): void {
    for (const l of this.settleListeners) l(rt.entity, rt.lethal);
  }

  private isHumanoid(entity: ClientEntity): boolean {
    if (entity.isVehicle || entity.isProp) return false;
    return !!(entity.isPed || entity.isPlayer || entity.three);
  }

  private distanceToPlayer(entity: ClientEntity): number {
    const player = this.playerQuery?.first;
    const t = entity.transform;
    if (!player?.transform || !t) return 0;
    _playerPos.set(player.transform.position.x, player.transform.position.y, player.transform.position.z);
    _entPos.set(t.position.x, t.position.y, t.position.z);
    return _playerPos.distanceTo(_entPos);
  }

  private seedVelocity(entity: ClientEntity): { x: number; y: number; z: number } {
    const v = entity.velocity?.linear;
    if (!v) return { x: 0, y: 0, z: 0 };
    // Clamp so a bogus velocity can't launch a corpse into orbit.
    const max = 12;
    return {
      x: THREE.MathUtils.clamp(v.x, -max, max),
      y: THREE.MathUtils.clamp(v.y, -max, max),
      z: THREE.MathUtils.clamp(v.z, -max, max),
    };
  }

  private toppleHit(): HitReactionParams {
    return { bone: "chest", dir: [0.45, -0.15, 0.55], magnitude: DEATH_TOPPLE_IMPULSE, type: "death", lethal: true };
  }

  private setTag(entity: ClientEntity, key: "ragdoll_active" | "ragdoll_lethal"): void {
    if (!entity[key]) world.addComponent(entity, key, true);
  }

  /** Set `ragdoll_state`, using addComponent on first set so trigger queries reindex correctly. */
  private setState(entity: ClientEntity, phase: RagdollPhase): void {
    if (entity.ragdoll_state === undefined) world.addComponent(entity, "ragdoll_state", phase);
    else entity.ragdoll_state = phase;
  }

  private mirrorState(rt: RagdollRuntime, handle: number): void {
    const e = rt.entity;
    this.setState(e, rt.phase);
    if (e.ragdoll_tier === undefined) world.addComponent(e, "ragdoll_tier", rt.tier);
    else e.ragdoll_tier = rt.tier;
    if (e.ragdoll_handle === undefined) world.addComponent(e, "ragdoll_handle", handle);
    else e.ragdoll_handle = handle;
  }
}

/** The singleton director. */
export const ragdollDirector = new RagdollDirector();
