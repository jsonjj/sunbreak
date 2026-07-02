// Economy port — how activity rewards reach the player's wallet.
//
// PRIMARY (when Economy lands): the integrator injects an adapter that calls the Economy API
// (e.g. useEconomy.getState().grantPayout / earn / grantXp). See configureActivityPorts().
//
// FALLBACK (default, works today): credit the shared HUD cash mirror and surface a toast so the
// reward is visible and the subsystem is fully playable standalone.

import { useHudStore } from "@/stores/hud.store";
import { useUiStore } from "@/stores/ui.store";
import type { RewardSpec } from "../types";
import { makeActId } from "../ids";

export interface RewardMeta {
  activityId: string;
  runId: string;
  tier?: string;
  /** Human-readable reason, e.g. "Neon Mile Sprint — Gold". */
  reason: string;
}

export interface EconPort {
  /** Grant a reward. Implementations must be safe to call once per completed run. */
  grantReward(reward: RewardSpec, meta: RewardMeta): void;
}

export function createDefaultEconPort(): EconPort {
  return {
    grantReward(reward, meta) {
      const cash = reward.cash ?? 0;
      if (cash > 0) {
        const hud = useHudStore.getState();
        hud.patch({ cash: hud.cash + cash });
      }

      const wallet = reward.dirty ? "dirty cash" : "cash";
      const parts: string[] = [];
      if (cash > 0) parts.push(`+$${cash.toLocaleString()} ${wallet}`);
      const xp = reward.skillXp;
      if (xp) {
        for (const [skill, amount] of Object.entries(xp)) parts.push(`+${amount} ${skill} XP`);
      }
      if (reward.unlockId) parts.push(`unlocked ${reward.unlockId}`);

      const text = parts.length ? `${meta.reason}: ${parts.join(" · ")}` : meta.reason;
      useUiStore.getState().pushToast({ id: makeActId("reward"), text });
    },
  };
}
