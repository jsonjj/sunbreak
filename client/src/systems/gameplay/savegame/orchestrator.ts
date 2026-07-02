// Central save orchestrator: snapshots + restores every persistable slice (economy, stats,
// inventory, mission progress) AND the player's world position/heading, so a slot captures the
// full run. Each slice is read/written through its owning subsystem's public API — no internals.

import { CharacterId, DEFAULT_SPAWN } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import { input } from "@/input/InputManager";
import { playerHandle } from "@/player/playerHandle";
import { useGameStore } from "@/stores/game.store";

import { economyApi, useEconomy } from "@/systems/gameplay/economy";
import type { EconomySave } from "@/systems/gameplay/economy";
import { serialize as serializeStats, restore as restoreStats } from "@/systems/gameplay/stats";
import type { StatsSave } from "@/systems/gameplay/stats";
import { useInventoryStore } from "@/systems/gameplay/inventory";
import type { InventorySnapshot } from "@/systems/gameplay/inventory";
import { missionProgress, missionManager } from "@/systems/gameplay/missions";
import type { MissionSaveSlice } from "@/systems/gameplay/missions";

const localPlayerQ = world.with("isLocal", "transform");

export interface SavedPosition {
  x: number;
  y: number;
  z: number;
  /** Camera/heading yaw (radians). */
  yaw: number;
}

export interface SaveMeta {
  slot: number;
  savedAt: number;
  character: CharacterId;
  cash: number;
}

export interface SaveData {
  version: 1;
  meta: SaveMeta;
  economy: EconomySave;
  stats: StatsSave;
  inventory: InventorySnapshot;
  missions: MissionSaveSlice;
  position: SavedPosition | null;
  character: CharacterId;
}

function capturePosition(): SavedPosition | null {
  const body = playerHandle.body;
  if (body) {
    const t = body.translation();
    return { x: t.x, y: t.y, z: t.z, yaw: input.yaw };
  }
  const e = localPlayerQ.entities[0];
  if (e?.transform) {
    const p = e.transform.position;
    return { x: p.x, y: p.y, z: p.z, yaw: input.yaw };
  }
  return null;
}

/** Move the player to a saved position. Retries across frames until the kinematic body exists. */
export function applyPosition(pos: SavedPosition | null): void {
  if (!pos) return;
  let tries = 0;
  const apply = (): void => {
    const e = localPlayerQ.entities[0];
    if (e?.transform) {
      e.transform.position.x = pos.x;
      e.transform.position.y = pos.y;
      e.transform.position.z = pos.z;
    }
    const body = playerHandle.body;
    if (body) {
      body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
      input.yaw = pos.yaw;
      return;
    }
    if (tries++ < 120 && typeof requestAnimationFrame !== "undefined") requestAnimationFrame(apply);
  };
  apply();
}

export function snapshotGame(slot: number): SaveData {
  const character = useGameStore.getState().activeCharacter;
  return {
    version: 1,
    meta: { slot, savedAt: Date.now(), character, cash: economyApi.getBalance().cash },
    economy: economyApi.serializeSave(),
    stats: serializeStats(),
    inventory: useInventoryStore.getState().toSnapshot(),
    missions: missionProgress.export(),
    position: capturePosition(),
    character,
  };
}

export function restoreGame(data: SaveData): void {
  try {
    economyApi.loadSave(data.economy);
  } catch {
    /* ignore malformed economy slice */
  }
  try {
    restoreStats(data.stats);
  } catch {
    /* ignore malformed stats slice */
  }
  try {
    useInventoryStore.getState().hydrate(data.inventory);
  } catch {
    /* ignore malformed inventory slice */
  }
  try {
    missionProgress.import(data.missions);
    missionManager.refreshStatuses();
  } catch {
    /* ignore malformed mission slice */
  }
  try {
    if (data.character) useGameStore.getState().switchCharacter(data.character);
  } catch {
    /* ignore */
  }
  applyPosition(data.position);
}

/** Fresh start: reset the persisted stores + drop the player at the default spawn. */
export function resetGame(): void {
  try {
    useEconomy.getState().resetEconomy();
  } catch {
    /* ignore */
  }
  try {
    missionProgress.import(undefined);
    missionManager.refreshStatuses();
  } catch {
    /* ignore */
  }
  applyPosition({ x: DEFAULT_SPAWN[0], y: DEFAULT_SPAWN[1], z: DEFAULT_SPAWN[2], yaw: 0 });
}
