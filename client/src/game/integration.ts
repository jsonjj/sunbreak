// ─────────────────────────────────────────────────────────────────────────────
// CENTRAL INTEGRATION — cross-subsystem data funnels, the player avatar, and the
// economy / interaction / AI wiring that connects the (otherwise isolated) subsystems.
// ─────────────────────────────────────────────────────────────────────────────
// Owned by the integrator (not a subsystem). Imported ONCE from main.tsx AFTER the
// systems-loader, so every subsystem has already self-registered. Everything here is
// defensive (guarded/try-caught) — nothing may throw at boot.

import { PLAYER_CAPSULE } from "@sunbreak/shared";
import { registerSystem } from "./registry";
import { world } from "../ecs/world";
import { input } from "@/input/InputManager";

// Player avatar: a rigged lead attached to the local player entity (its `three` renders through
// the generic ECS↔R3F bridge; the char drive system positions/animates it from transform+movement).
import { attachCharacter, createCharacter } from "@/systems/gameplay/character-content";

// Day/night is the authoritative clock; point look-dev (materials) + weather (vfx) at it.
import { getEnv } from "@/systems/gameplay/daynight";
import { setTimeOfDay as matSetTimeOfDay, setWetness as matSetWetness } from "@/systems/render/materials";
import { setRain as vfxSetRain, setWind as vfxSetWind } from "@/systems/render/vfx";

// Road graph: publish the City-Gen graph so peds + traffic adopt it (both also self-fallback).
import { cityStore, ensureCityMap } from "@/systems/render/city";

// ── Economy + consumers (the earn⇄spend loop) ────────────────────────────────────────────────
import { economyApi, useEconomy } from "@/systems/gameplay/economy";
import type { SkillId } from "@/systems/gameplay/economy";
import { inventoryApi } from "@/systems/gameplay/inventory";
import type { AmmoType } from "@/systems/gameplay/inventory";
import { statsApi } from "@/systems/gameplay/stats";
import {
  setEconomyApi,
  gameEvents,
  bindDefaultKeys,
} from "@/systems/ui/game-ux";
import type {
  EconomyApi as UxEconomyApi,
  Wallet as UxWallet,
  Grants as UxGrants,
  UxCurrency,
} from "@/systems/ui/game-ux";
import { registerMissionEconomy, registerMissionWanted, missionManager } from "@/systems/gameplay/missions";
import { configureActivityPorts } from "@/systems/gameplay/activities";
import type { RewardSpec } from "@/systems/gameplay/activities";

// ── Wanted / traffic / peds (server-less cross-AI reactions) ──────────────────────────────────
import { useWantedStore, getWantedLevel, reportCrime } from "@/systems/gameplay/wanted";
import {
  provideWanted,
  provideSirenNear,
  provideCrimeReporter,
  getVehiclesNear,
} from "@/systems/gameplay/traffic";
import { setPedVehicleProvider } from "@/systems/gameplay/peds";

// ── Interaction pillar (shops / NPCs / doors / pickups) ───────────────────────────────────────
import { interactionEvents } from "@/systems/gameplay/interaction";

// ── Weapon grants (combat) + car grants (vehicle-gameplay) + map blips (menu-hud) ─────────────
import { giveWeapon, giveWeaponFromShopItem } from "@/systems/gameplay/combat";
import { spawnVehicle } from "@/systems/gameplay/vehicle-gameplay";
import { addBlip, removeBlip, clearBlips } from "@/systems/ui/menu-hud";

// GTA content placement (acquisition points, POI/mission/activity blips, pickups, moving blips).
import { placeWorldContent } from "./worldContent";

/** Capsule center → feet-origin offset so the rig's feet sit on the ground. */
const PLAYER_YOFFSET = -(PLAYER_CAPSULE.halfHeight + PLAYER_CAPSULE.radius);

const localPlayerQ = world.with("isLocal", "transform");
const policeQ = world.with("wanted_police", "transform");
let envAcc = 0;

// ─────────────────────────────────────────────────────────────────────────────
// ECONOMY GLUE — route ALL money through the single-source `useEconomy` wallet.
// ─────────────────────────────────────────────────────────────────────────────
const UX_FEES: Record<string, number> = { hospital: 250, bribe: 500, respawn: 250 };

function uxWallet(): UxWallet {
  const b = economyApi.getBalance();
  return { clean: b.cash, dirty: b.dirty, stash: b.bank };
}

/** Grant a weapon by ANY id form: economy shop id (wpn_smg), inventory id (smg_vector), or a bare
 *  name (smg). Routes through combat so it's a REAL, usable weapon + starter ammo (equipped). */
function grantWeaponAnyId(id: string): boolean {
  return (
    giveWeaponFromShopItem(id, { equip: true }) ||
    giveWeaponFromShopItem(`wpn_${id}`, { equip: true }) ||
    giveWeapon(id, { equip: true })
  );
}

/** Apply a shop/pickup/reward grant token ("wpn:wpn_smg", "weapon:smg", "veh:sports", "armor:50",
 *  "heal:full", "cash:500", "ammo:pistol:60"). */
function applyGrantItem(item: string): void {
  const [kind, a, b] = item.split(":");
  switch (kind) {
    case "wpn":
    case "weapon":
      if (a) grantWeaponAnyId(a);
      break;
    case "veh": {
      if (!a) break;
      const p = localPlayerQ.entities[0]?.transform?.position;
      try {
        // Drive it off the lot: spawn clearly BESIDE the player (not on top of them), facing out.
        spawnVehicle(a as Parameters<typeof spawnVehicle>[0], {
          x: (p?.x ?? 0) + 6,
          z: (p?.z ?? 0) + 2,
          yaw: Math.PI / 2,
        });
      } catch {
        /* vehicle spawn failed */
      }
      break;
    }
    case "ammo":
      if (a) inventoryApi.addAmmo(a as AmmoType, Number(b ?? 0) || 0);
      break;
    case "cash":
      economyApi.addMoney(Number(a ?? 0) || 0);
      break;
    case "armor":
      statsApi.addArmor(Number(a ?? 0) || 0);
      break;
    case "heal":
      if (a === "full") statsApi.fullHeal();
      else statsApi.heal(Number(a ?? 0) || 0);
      break;
    default:
      break; // cosmetics (wear:*) have no v1 gameplay effect
  }
}

/** game-ux economy contract backed by the real `useEconomy` wallet (replaces the HUD-only default). */
const realUxEconomy: UxEconomyApi = {
  getWallet: uxWallet,
  canAfford: (amount, currency: UxCurrency = "clean") => {
    const w = uxWallet();
    if (currency === "stash") return w.clean + w.stash >= amount;
    return w[currency] >= amount;
  },
  charge: (amount, currency: UxCurrency = "clean") => {
    const amt = Math.max(0, Math.round(amount));
    if (amt <= 0) return true;
    if (currency === "stash") return economyApi.spend(amt, { allowBank: true });
    // No dedicated dirty-cash debit in the economy rules yet — charge clean so the transaction
    // still completes deterministically (a "dirty"-priced item is paid in clean cash).
    return economyApi.spend(amt);
  },
  grant: (grants?: UxGrants) => {
    if (!grants) return;
    if (grants.cash) economyApi.addMoney(grants.cash);
    if (grants.dirty) economyApi.addMoney(grants.dirty, { dirty: true });
    for (const item of grants.items ?? []) applyGrantItem(item);
    gameEvents.emit("economy:wallet", uxWallet());
  },
  feeFor: (kind) => UX_FEES[kind] ?? 0,
  subscribe: (cb) => useEconomy.subscribe(() => cb(uxWallet())),
};

function wireEconomy(): void {
  // Shops + phone wallet → real economy.
  try {
    setEconomyApi(realUxEconomy);
  } catch {
    /* game-ux not ready */
  }
  // Mission rewards → real economy + real wanted.
  try {
    registerMissionEconomy({
      addCash: (amount) => economyApi.addMoney(amount),
      addRep: () => {
        /* no shared rep wallet in v1 — reputation is surfaced only in the result card */
      },
      giveWeapon: (weaponId) => applyGrantItem(`weapon:${weaponId}`),
    });
  } catch {
    /* missions not ready */
  }
  try {
    registerMissionWanted({
      stars: () => getWantedLevel(),
      set: (stars) => useWantedStore.getState().setStars(stars),
    });
  } catch {
    /* wanted not ready */
  }
  // Activity rewards → real economy (keeps the map/interaction fallbacks, which already work).
  try {
    configureActivityPorts({
      econ: {
        grantReward: (reward: RewardSpec, meta) => {
          const cash = reward.cash ?? 0;
          if (cash > 0) economyApi.grantPayout(economyApi.activeChar(), cash, { dirty: reward.dirty });
          if (reward.skillXp) {
            for (const [skill, amt] of Object.entries(reward.skillXp)) {
              economyApi.grantXp(skill as SkillId, amt);
            }
          }
          gameEvents.emit("toast", {
            kind: "cash",
            text: cash > 0 ? `+$${cash.toLocaleString()}` : meta.reason,
            sub: cash > 0 ? meta.reason : undefined,
          });
        },
      },
      // Activity giver/objective markers → the real minimap + map (kept `act_`-prefixed).
      blips: {
        upsert: (b) =>
          addBlip({ id: b.id, worldPos: { x: b.x, z: b.z }, kind: "activity", label: b.label }),
        remove: (id) => removeBlip(id),
        clearOwned: () => clearBlips((bl) => bl.id.startsWith("act_")),
      },
    });
  } catch {
    /* activities not ready */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-AI — traffic reacts to police; peds dodge cars (all offline / server-less).
// ─────────────────────────────────────────────────────────────────────────────
function sirenNear(x: number, z: number): boolean {
  if (getWantedLevel() <= 0) return false;
  for (const e of policeQ.entities) {
    const p = e.transform!.position;
    const dx = p.x - x;
    const dz = p.z - z;
    if (dx * dx + dz * dz < 40 * 40) return true;
  }
  return false;
}

function wireTrafficAndPeds(): void {
  try {
    provideWanted(() => getWantedLevel());
    provideSirenNear((x, z) => sirenNear(x, z));
    provideCrimeReporter((x, z) => reportCrime({ type: "recklessDrive", position: { x, y: 0.5, z } }));
  } catch {
    /* traffic not ready */
  }
  try {
    // Peds dodge ambient cars using traffic's proximity query (mapped to the ped sample shape).
    setPedVehicleProvider((x, z, r) =>
      getVehiclesNear(x, z, r).map((v) => ({ x: v.pos.x, z: v.pos.z, vx: v.vel.x, vz: v.vel.z })),
    );
  } catch {
    /* peds not ready */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTION — place world interactables + turn their events into real effects.
// ─────────────────────────────────────────────────────────────────────────────
function npcGreeting(npcId?: string): string {
  switch (npcId) {
    case "val":
      return "Val: Keep it clean on my block and we'll get along.";
    case "atm": {
      const b = economyApi.getBalance();
      return `ATM · Cash $${b.cash.toLocaleString()} · Bank $${b.bank.toLocaleString()}`;
    }
    default:
      return "They give you a wary nod.";
  }
}

function wireInteraction(): void {
  // The actual acquisition points (gun store, dealership, safehouse, ATM, helipad/marina, weapon
  // pickups) + all their blips are placed by placeWorldContent() at real district coordinates. Here
  // we only wire the interaction OUTCOMES → real subsystem effects.

  // A couple of walk-over cash pickups near the spawn so money is discoverable immediately.
  try {
    economyApi.dropCash({ x: 6, y: 0.6, z: 12 }, 400);
    economyApi.dropCash({ x: -8, y: 0.6, z: 3 }, 300);
  } catch {
    /* economy not ready */
  }

  // Interaction outcomes → real subsystem effects.
  interactionEvents.on("shop_buy", ({ entity }) => {
    const data = entity.interact_?.data as { vendorId?: string } | undefined;
    gameEvents.emit("shop:open", { vendorId: data?.vendorId ?? "gunstore" });
    input.releaseLock(); // free the cursor for the shop overlay
  });
  interactionEvents.on("item_pickup", ({ itemId }) => {
    if (itemId) applyGrantItem(itemId);
  });
  interactionEvents.on("npc_talk", ({ npcId }) => {
    gameEvents.emit("toast", { kind: "info", text: npcGreeting(npcId), sub: "NPC" });
  });
  interactionEvents.on("door", ({ open }) => {
    gameEvents.emit("toast", { kind: "info", text: open ? "Door unlocked" : "Door closed" });
  });

  // Opt-in convenience hotkeys (P = phone). Release pointer lock so the DOM overlay is usable.
  try {
    bindDefaultKeys({ phone: "p" });
  } catch {
    /* game-ux not ready */
  }
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", (e) => {
      if (!e.repeat && e.key.toLowerCase() === "p") input.releaseLock();
    });
  }
}

/** Wire the funnels + avatar + economy/interaction/AI. Call once, after the systems-loader, before React renders. */
export function wireIntegration(): void {
  // 1) Attach a lead rig to the local player once it exists, and hide it while seated in a car.
  registerSystem({
    name: "integration:playerAvatar",
    phase: "update",
    order: -900,
    fn: () => {
      for (const e of localPlayerQ.entities) {
        if (e.char_kind === undefined) {
          try {
            attachCharacter(e, createCharacter("cami"), { yOffset: PLAYER_YOFFSET });
          } catch {
            /* rig build failed — player stays unrendered; the rest of the world is unaffected */
          }
        }
        if (e.three) e.three.visible = e.vg_occupant === undefined; // hide on-foot rig while driving
      }
    },
  });

  // 2) Day/night → materials look-dev + vfx weather (throttled). daynight owns the clock; these
  //    consumers only READ it here instead of self-advancing separate clocks.
  registerSystem({
    name: "integration:envFunnel",
    phase: "render",
    order: 200,
    fn: (_w, dt) => {
      envAcc += dt;
      if (envAcc < 0.1) return;
      envAcc = 0;
      const env = getEnv();
      if (!env) return;
      try {
        matSetTimeOfDay(env.tod01);
        matSetWetness(env.wetness);
        vfxSetRain(env.rain);
        vfxSetWind(env.wind[0], env.wind[1] ?? 0, env.wind[2]);
      } catch {
        /* best-effort look-dev funnel */
      }
    },
  });

  // 3) Road-graph funnel: publish the city graph on the untyped window seam peds + traffic already
  //    listen on (peds: `__SUNBREAK_ROAD_GRAPH__` + the ready event; traffic: `__SUNBREAK_CITY__`).
  try {
    ensureCityMap();
    const graph = cityStore.roadGraph;
    if (graph && typeof window !== "undefined") {
      const w = window as unknown as {
        __SUNBREAK_ROAD_GRAPH__?: unknown;
        __SUNBREAK_CITY__?: { getRoadGraph?: () => unknown; roadGraph?: unknown };
      };
      w.__SUNBREAK_ROAD_GRAPH__ = graph;
      w.__SUNBREAK_CITY__ = { getRoadGraph: () => graph, roadGraph: graph };
      window.dispatchEvent(new CustomEvent("sunbreak:roadgraph-ready", { detail: graph }));
    }
  } catch {
    /* city not ready / shape mismatch — peds + traffic use their procedural grids */
  }

  // 4) Connect the earn⇄spend economy loop (shops/missions/activities → single-source wallet).
  wireEconomy();

  // 5) Server-less cross-AI reactions (traffic ↔ police, peds ↔ traffic).
  wireTrafficAndPeds();

  // 6) Activate the interaction pillar (interaction-outcome handlers + hotkeys).
  wireInteraction();

  // 7) Place the GTA content: acquisition points, POI/mission-giver/activity blips, weapon pickups,
  //    the first-mission waypoint, and moving-entity (player-car / police) blips.
  placeWorldContent();
}
