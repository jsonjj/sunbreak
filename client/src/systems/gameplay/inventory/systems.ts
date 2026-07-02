// ECS systems for the inventory subsystem. Registered from index.ts.
//   - inventoryInputSystem  (update): drives the wheel/reload from the SHARED input snapshot.
//   - equippedMirrorSystem  (update): mirrors store -> player `inv_*` components (Combat reads).
//   - hudFeedSystem         (finish): mirrors weapon/ammo into the shared HUD store.
// Plus installConsumableEffects(): applies health/armor to the player's `health` component.

import type { System } from "@sunbreak/shared";
import { InputAction } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import { input } from "@/input/InputManager";
import { useHudStore } from "@/stores/hud.store";
import { useInventoryStore } from "./store";
import { buildInvEquipped } from "./components";
import { inventoryEvents } from "./events";

type W = typeof world;

/** Local archetype query — the player entity carries our `inv_*` read-model. */
const players = world.with("isPlayer");

function player() {
  return players.entities[0];
}

/**
 * Read the shared input snapshot (refreshed by <InputBinder> at priority -1000) and drive the
 * wheel + reload. `SwitchWeapon` is the canonical wheel action; it is not yet sampled by the v0
 * InputManager, so see index.ts / the report for the one-line integrator seam. `Reload` already
 * flows through the snapshot and works today.
 */
export const inventoryInputSystem: System<W> = {
  name: "inv/input",
  phase: "update",
  order: -30,
  fn: () => {
    const snap = input.snapshot;
    const st = useInventoryStore.getState();
    if (snap.justPressed.has(InputAction.SwitchWeapon)) st.openWheel();
    if (snap.justReleased.has(InputAction.SwitchWeapon)) st.closeWheel();
    if (snap.justPressed.has(InputAction.Reload)) st.reload();
  },
};

/** Mirror the equipped weapon + reserve pools onto the player entity every frame (cheap POJO
 *  writes). Combat reads `entity.inv_equipped` / `entity.inv_ammo` without touching the store. */
export const equippedMirrorSystem: System<W> = {
  name: "inv/mirror",
  phase: "update",
  order: -20,
  fn: () => {
    const p = player();
    if (!p) return;
    const st = useInventoryStore.getState();
    const def = st.equippedDef();
    const inst = st.equippedInstance();
    const eq = buildInvEquipped(def, inst, def ? st.reserveOf(def.ammoType) : 0);

    if (eq) {
      if (p.inv_equipped) Object.assign(p.inv_equipped, eq);
      else world.addComponent(p, "inv_equipped", eq);
    } else if (p.inv_equipped) {
      world.removeComponent(p, "inv_equipped");
    }

    if (p.inv_ammo) Object.assign(p.inv_ammo, st.ammo);
    else world.addComponent(p, "inv_ammo", { ...st.ammo });
  },
};

/** Push weapon/ammo into the shared HUD store (throttled + change-gated, like hudSyncSystem). */
export const hudFeedSystem: System<W> = (() => {
  const RATE = 1 / 10;
  let acc = 0;
  const last = { weapon: "" as string | null, clip: -1, reserve: -1 };
  return {
    name: "inv/hudFeed",
    phase: "finish",
    fn: (_w, dt) => {
      acc += dt;
      if (acc < RATE) return;
      acc = 0;
      const st = useInventoryStore.getState();
      const def = st.equippedDef();
      const inst = st.equippedInstance();
      const weapon = def?.name ?? null;
      const clip = inst?.mag ?? 0;
      const reserve = def ? st.reserveOf(def.ammoType) : 0;
      if (weapon === last.weapon && clip === last.clip && reserve === last.reserve) return;
      last.weapon = weapon;
      last.clip = clip;
      last.reserve = reserve;
      useHudStore.getState().patch({ weapon, ammoClip: clip, ammoReserve: reserve });
    },
  } satisfies System<W>;
})();

export const inventorySystems: ReadonlyArray<System<W>> = [
  inventoryInputSystem,
  equippedMirrorSystem,
  hudFeedSystem,
];

/** Apply consumable effects to the player's shared `health` component. */
export function installConsumableEffects(): () => void {
  const handler = (e: { id: string; kind: string; amount: number }): void => {
    const p = player();
    if (!p?.health) return;
    if (e.kind === "health") {
      p.health.current = Math.min(p.health.max, p.health.current + e.amount);
    } else if (e.kind === "armor") {
      p.health.armor = Math.min(100, p.health.armor + e.amount);
    }
  };
  inventoryEvents.on("consumable", handler);
  return () => inventoryEvents.off("consumable", handler);
}
