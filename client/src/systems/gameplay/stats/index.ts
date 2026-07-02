// gameplay/stats — PLAYER STATS / HEALTH / DEATH subsystem (client).
// Single authority on player vitals (health/armor/stamina/ability) and the alive → dead/busted
// → respawned transitions. Owns the `stat_*` ECS components combat + peds decrement, the pure
// vitals reducers, out-of-combat regen, stamina, fall damage, and the death/respawn flow. Mirrors
// the active lead's values into the shared HUD store. Self-registers on import — no central edits.

import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import type { world } from "@/ecs/world";
import { useGameStore } from "@/stores/game.store";
import "./stats.components"; // ECS `SimComponents` augmentation (side-effect import)
import { AUTOSAVE_MS } from "./constants";
import { setActiveCharacter } from "./characters";
import { snapshotActivePlayer, switchActiveCharacter } from "./entityVitals";
import { loadSaved, writeSaved } from "./save";
import { useStatStore } from "./store";
import { statsApi } from "./bridge";
import { vitalsSystem } from "./vitalsSystem";
import { deathRespawnSystem } from "./deathRespawnSystem";
import { hudMirrorSystem } from "./hudMirrorSystem";

type W = typeof world;

export const stats: SubsystemModule<W> = {
  id: "gameplay/stats",
  systems: [vitalsSystem, deathRespawnSystem, hudMirrorSystem],
  init() {
    // Restore persisted per-character vitals; follow the game store for the active lead so we
    // never mutate central state from here.
    loadSaved();
    const active = useGameStore.getState().activeCharacter;
    setActiveCharacter(active);
    useStatStore.getState().patch({ active });

    // React to character switches driven by the game store.
    const unsubGame = useGameStore.subscribe(
      (s) => s.activeCharacter,
      (next) => {
        switchActiveCharacter(next);
        useStatStore.getState().patch({ active: next });
      },
    );

    // Low-frequency autosave, off the render hot path.
    const autosave = setInterval(() => {
      snapshotActivePlayer();
      writeSaved();
    }, AUTOSAVE_MS);

    const onUnload = (): void => {
      snapshotActivePlayer();
      writeSaved();
    };
    if (typeof window !== "undefined") window.addEventListener("beforeunload", onUnload);

    // Dev-only tuning handle: __sunbreakStats.hurt(25) / .kill() / .bust() / .god(true) …
    if (import.meta.env.DEV && typeof window !== "undefined") {
      (window as unknown as { __sunbreakStats?: typeof statsApi }).__sunbreakStats = statsApi;
    }

    return () => {
      unsubGame();
      clearInterval(autosave);
      if (typeof window !== "undefined") window.removeEventListener("beforeunload", onUnload);
    };
  },
};

registerModule(stats); // required self-registration side-effect

// ─── Public API (for combat, peds, economy, wanted, HUD, save, and the integrator) ──────────
export * from "./bridge"; // damageEntity, damagePlayer, kill/bust/heal/addArmor, setIntent, etc.
export * from "./respawnPoints"; // nearest(), RESPAWN_NODES, SAFE_FALLBACK
export { useStatStore } from "./store";
export type { StatStoreState, StatSnapshot } from "./store";
export { serialize, restore } from "./save";
export {
  applyDamage,
  tickHealthRegen,
  tickStamina,
  fallDamage,
  freshVitals,
  canSprint,
  isExhausted,
  staminaFraction,
} from "./vitals";
export * as statsConstants from "./constants";
export type {
  Vitals,
  PersistedVitals,
  DamageEvent,
  DamageType,
  HitZone,
  RespawnReason,
  RespawnPhase,
  StaminaIntent,
  StatsSave,
  EconomyBridge,
  PoliceBridge,
} from "./types";
