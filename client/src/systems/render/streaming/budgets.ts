// Per-quality-tier streaming budgets. These mirror the SUNBREAK performance table (draw calls,
// resident ring, instance caps, DPR) and are read by the ChunkManager + instance pools to keep a
// fixed browser memory/draw-call budget. The tier itself is owned by the v0 render/quality store
// (single source of truth) — we only READ it (never mutate), with a safe fallback.
import { useQuality } from "@/render/quality/useQuality";
import type { TierName } from "@/render/quality/tiers";

export interface StreamBudget {
  tier: TierName;
  /** Draw-call soft target / hard cap (for the perf overlay + HLOD aggressiveness). */
  drawCallTarget: number;
  drawCallHardCap: number;
  /** Chebyshev radius of fully-resident (near-shell) chunks. ring 1→3×3, 2→5×5, 3→7×7. */
  residentRing: number;
  /** Outer Chebyshev radius of cheap proxy skyline chunks (HLOD ring). */
  hlodRing: number;
  /** DPR cap for this tier (informational; the render subsystem applies it). */
  dprCap: number;
  /** Hard cap on total live prop instances across all pools. */
  propInstanceCap: number;
  pedNear: number;
  pedTotal: number;
  trafficVehicles: number;
  /** Main-thread ms/frame the streaming pump may spend building/disposing chunks. */
  pumpMsBudget: number;
}

export const STREAM_BUDGETS: Record<TierName, StreamBudget> = {
  low: {
    tier: "low",
    drawCallTarget: 120,
    drawCallHardCap: 180,
    residentRing: 1,
    hlodRing: 4,
    dprCap: 1.25,
    propInstanceCap: 1500,
    pedNear: 40,
    pedTotal: 300,
    trafficVehicles: 20,
    pumpMsBudget: 2,
  },
  medium: {
    tier: "medium",
    drawCallTarget: 180,
    drawCallHardCap: 260,
    residentRing: 2,
    hlodRing: 6,
    dprCap: 1.5,
    propInstanceCap: 3000,
    pedNear: 100,
    pedTotal: 600,
    trafficVehicles: 40,
    pumpMsBudget: 2,
  },
  high: {
    tier: "high",
    drawCallTarget: 250,
    drawCallHardCap: 350,
    residentRing: 3,
    hlodRing: 8,
    dprCap: 2.0,
    propInstanceCap: 5000,
    pedNear: 180,
    pedTotal: 1000,
    trafficVehicles: 70,
    pumpMsBudget: 2,
  },
};

/** Current budget from the live quality tier (defensive: never throws, defaults to medium). */
export function currentBudget(): StreamBudget {
  try {
    const tier = useQuality.getState().tier;
    return STREAM_BUDGETS[tier] ?? STREAM_BUDGETS.medium;
  } catch {
    return STREAM_BUDGETS.medium;
  }
}
