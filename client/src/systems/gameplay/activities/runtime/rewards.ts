// Reward application. Chooses a tier (if authored), routes cash/xp/unlocks through the Economy
// port, records best times/scores, and is idempotent per runId so a completion can never double-pay
// (important once network reconciliation or retries enter the picture).

import type { ActivityDef, RewardSpec, RunResult } from "../types";
import { getPorts } from "../ports";
import { useActivityStore } from "./store";
import type { ActiveRun } from "./types";

const rewarded = new Set<string>();

/** Pick the first authored tier the run qualifies for (tiers are authored best→worst). */
function pickTier(def: ActivityDef, score: number, elapsedMs: number): { label?: string; reward: RewardSpec } {
  for (const tier of def.rewardTiers ?? []) {
    const scoreOk = tier.minScore == null || score >= tier.minScore;
    const timeOk = tier.maxTimeMs == null || elapsedMs <= tier.maxTimeMs;
    if (scoreOk && timeOk) return { label: tier.label, reward: tier.reward };
  }
  return { reward: def.reward };
}

/** Fold delivery leg payouts (carried on run.score) into the cash reward. */
function withEarnedCash(def: ActivityDef, base: RewardSpec, run: ActiveRun): RewardSpec {
  if (def.kind !== "delivery" || run.score <= 0) return base;
  return { ...base, cash: (base.cash ?? 0) + run.score };
}

export function buildResult(run: ActiveRun, success: boolean): RunResult {
  const chosen = pickTier(run.def, run.score, run.elapsedMs);
  const reward = success ? withEarnedCash(run.def, chosen.reward, run) : {};
  return {
    activityId: run.def.id,
    runId: run.runId,
    success,
    score: run.score,
    elapsedMs: run.elapsedMs,
    tier: success ? chosen.label : undefined,
    reward,
  };
}

export function applyRewards(run: ActiveRun, result: RunResult): void {
  if (!result.success) return;
  if (rewarded.has(result.runId)) return;
  rewarded.add(result.runId);

  const store = useActivityStore.getState();
  const reason = result.tier ? `${run.def.name} — ${result.tier}` : run.def.name;

  getPorts().econ.grantReward(result.reward, {
    activityId: result.activityId,
    runId: result.runId,
    tier: result.tier,
    reason,
  });

  // Best cache: fastest time for timed kinds, highest score for rampage.
  const timed = run.def.kind === "race" || run.def.kind === "delivery";
  const metric = timed ? result.elapsedMs : result.score;
  const prev = store.best[result.activityId];
  const better = prev == null || (timed ? metric < prev : metric > prev);
  if (better) store.setBest(result.activityId, metric);

  if (result.reward.unlockId) store.appendLog(`Unlocked ${result.reward.unlockId} (${run.def.name})`);
  if (result.reward.skillXp) {
    for (const [skill, xp] of Object.entries(result.reward.skillXp)) {
      store.appendLog(`+${xp} ${skill} XP (${run.def.name})`);
    }
  }
}

/** Test/debug: forget which runs were rewarded. */
export function _resetRewardGuard(): void {
  rewarded.clear();
}
