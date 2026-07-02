// physics/ragdoll — fixed pool of pre-built rigs.
//
// Creating/removing bodies + joints rebuilds Rapier islands and hammers the WASM allocator, so we
// NEVER build per death. Rigs are built once at world-attach and toggled between parked (disabled)
// and live. Acquire prefers the requested tier and falls back to a cheaper (higher) tier.

import { buildRagdoll, destroyRagdoll, parkRagdoll } from "./buildRagdoll";
import { getRig } from "./ragdollRig";
import type { RagdollCaps } from "./config";
import type { RagdollTier, RapierNamespace, RapierWorld, RigInstance } from "./types";

const TIERS: RagdollTier[] = [0, 1, 2];

export class RagdollPool {
  private rapier: RapierNamespace | null = null;
  private world: RapierWorld | null = null;
  private pools: Record<RagdollTier, RigInstance[]> = { 0: [], 1: [], 2: [] };
  private nextSlot = 0;
  private built = false;

  get isBuilt(): boolean {
    return this.built;
  }

  /** Pre-build every tier's pool. Idempotent. */
  build(rapier: RapierNamespace, world: RapierWorld, caps: RagdollCaps): void {
    if (this.built) return;
    this.rapier = rapier;
    this.world = world;
    const counts: Record<RagdollTier, number> = {
      0: caps.poolTier0,
      1: caps.poolTier1,
      2: caps.poolTier2,
    };
    for (const tier of TIERS) {
      const spec = getRig(tier);
      for (let i = 0; i < counts[tier]; i++) {
        this.pools[tier].push(buildRagdoll(rapier, world, spec, this.nextSlot++));
      }
    }
    this.built = true;
  }

  /** Acquire a free rig at `tier` (or the next cheaper tier). Returns null if all are in use. */
  acquire(tier: RagdollTier): RigInstance | null {
    for (const t of TIERS) {
      if (t < tier) continue; // only same-or-cheaper
      const free = this.pools[t].find((r) => !r.inUse);
      if (free) {
        free.inUse = true;
        return free;
      }
    }
    return null;
  }

  /** Return a rig to its pool (parked + disabled). */
  release(rig: RigInstance): void {
    if (this.rapier) parkRagdoll(this.rapier, rig);
    rig.inUse = false;
  }

  /** Count of in-use jointed rigs (Tier0/Tier1) — the expensive, capped ones. */
  activeJointedCount(): number {
    return this.pools[0].filter((r) => r.inUse).length + this.pools[1].filter((r) => r.inUse).length;
  }

  /** Total in-use bodies across all tiers (for the awake-body cap). */
  activeBodyCount(): number {
    let n = 0;
    for (const tier of TIERS) {
      for (const r of this.pools[tier]) if (r.inUse) n += r.spec.bodies.length;
    }
    return n;
  }

  /** Free every rig from the world (unmount). */
  teardown(): void {
    if (!this.world) return;
    for (const tier of TIERS) {
      for (const rig of this.pools[tier]) destroyRagdoll(this.world, rig);
      this.pools[tier].length = 0;
    }
    this.built = false;
    this.rapier = null;
    this.world = null;
    this.nextSlot = 0;
  }
}
