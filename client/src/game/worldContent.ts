// ─────────────────────────────────────────────────────────────────────────────
// GTA CONTENT PLACEMENT — acquisition points, points-of-interest, mission-giver &
// activity blips, world weapon pickups, and moving-entity (player-car / police) blips.
// ─────────────────────────────────────────────────────────────────────────────
// Integrator-owned (client/src/game). Called once from integration.ts AFTER every subsystem has
// self-registered. All coordinates come from the shared island geography (render/city/geography)
// and the vehicle LANDMARKS so nothing can drift from the map. Everything is guarded — a failure
// to place one thing never blocks the rest.

import { registerSystem } from "./registry";
import { world } from "../ecs/world";

import { spawnInteractable } from "@/systems/gameplay/interaction";
import { addBlip, setWaypoint } from "@/systems/ui/menu-hud";
import type { BlipKind } from "@/systems/ui/menu-hud";
import { registerCatalog } from "@/systems/ui/game-ux";
import type { ShopCatalog, ShopItem } from "@/systems/ui/game-ux";
import { purchasableWeapons, spawnWeaponPickup } from "@/systems/gameplay/combat";
import { spawnVehicle } from "@/systems/gameplay/vehicle-gameplay";
import { LANDMARKS } from "@/systems/physics/vehicle";
import { MARINA } from "@/systems/render/city/geography";
import { VehicleId } from "@sunbreak/shared";

const policeQ = world.with("wanted_police", "transform");
const vehiclesQ = world.with("veh_isVehicle", "transform");
const localQ = world.with("isLocal");

// ── Vendor catalogs (opened by the shop_buy interactables via game-ux) ─────────────────────────
/** Gun store roster, built from the combat catalog. Purchases grant a REAL, usable weapon +
 *  starter ammo via combat (see integration.ts `applyGrantItem` → giveWeaponFromShopItem). */
function buildGunStoreCatalog(): ShopCatalog {
  const items: ShopItem[] = purchasableWeapons()
    .filter((w) => w.shopItemId)
    .map((w) => ({
      id: w.shopItemId!,
      name: w.name,
      desc: w.blurb,
      price: w.price,
      currency: "clean" as const,
      category: w.category,
      grants: { items: [`wpn:${w.shopItemId!}`] },
    }));
  return {
    vendorId: "gunstore",
    name: "Ironsights Armory",
    tagline: "Costa Dorada steel. Cash on the counter, no questions.",
    items,
  };
}

/** Car dealership — purchases spawn the car next to the player (see `applyGrantItem` → "veh:"). */
function buildDealershipCatalog(): ShopCatalog {
  const cars: Array<{ id: string; name: string; price: number; veh: VehicleId; desc: string }> = [
    { id: "deal_coupe", name: "Verano Coupe", price: 14000, veh: VehicleId.Coupe, desc: "Clean lines, honest pace." },
    { id: "deal_suv", name: "Sierra SUV", price: 26000, veh: VehicleId.Suv, desc: "Seats the whole crew." },
    { id: "deal_sports", name: "Solaris GT", price: 52000, veh: VehicleId.Sports, desc: "The strip's fastest legal ride." },
  ];
  const items: ShopItem[] = cars.map((c) => ({
    id: c.id,
    name: c.name,
    desc: c.desc,
    price: c.price,
    currency: "clean" as const,
    category: "Vehicles",
    grants: { items: [`veh:${c.veh}`] },
  }));
  return { vendorId: "dealership", name: "Verano Motors", tagline: "Downtown wheels for every hustle.", items };
}

interface Poi {
  id: string;
  x: number;
  z: number;
  kind: BlipKind;
  label: string;
}

export function placeWorldContent(): void {
  // ── Vendor catalogs ──────────────────────────────────────────────────────────────────────
  try {
    registerCatalog(buildGunStoreCatalog());
    registerCatalog(buildDealershipCatalog());
  } catch {
    /* game-ux shop not ready */
  }

  // ── Acquisition interactables (each also gets a blip below) ─────────────────────────────────
  try {
    // Gun store (Costa Dorada, commercial) — sells usable weapons.
    spawnInteractable(
      { kind: "shop_buy", verb: "Buy weapons", label: "Ironsights Armory", range: 3.6, data: { vendorId: "gunstore" } },
      [235, 1, 40],
    );
    // Car dealership (downtown Miracle Row).
    spawnInteractable(
      { kind: "shop_buy", verb: "Buy a car", label: "Verano Motors", range: 4.2, data: { vendorId: "dealership" } },
      [-45, 1, 70],
    );
    // Garage / Safehouse (residential Calle Sol).
    spawnInteractable(
      { kind: "door", verb: "Enter", label: "Safehouse", data: { open: false } },
      [-300, 1, -250],
    );
    // ATM / Bank (downtown) — reports your balance (see integration `npcGreeting("atm")`).
    spawnInteractable(
      { kind: "npc_talk", verb: "Use ATM", label: "ATM", data: { npcId: "atm" } },
      [40, 1, -35],
    );
  } catch {
    /* interaction not ready */
  }

  // A couple of showcase cars parked on the dealership lot.
  try {
    spawnVehicle(VehicleId.Sports, { x: -54, z: 74, yaw: 0, parked: true });
    spawnVehicle(VehicleId.Coupe, { x: -54, z: 66, yaw: 0, parked: true });
  } catch {
    /* vehicle-gameplay not ready */
  }

  // ── World weapon pickups (walk-over → granted via combat) ──────────────────────────────────
  try {
    spawnWeaponPickup({ x: -14, y: 1, z: 14 }, "pistol_9mm", { respawn: true });
    spawnWeaponPickup({ x: 226, y: 1, z: 58 }, "smg_vector", { respawn: true, equip: false });
  } catch {
    /* combat not ready */
  }

  // ── Blips: acquisition points + landmarks + services, so the map reads as a living city ─────
  const pois: Poi[] = [
    // Acquisition
    { id: "poi:gunstore", x: 235, z: 40, kind: "shop", label: "Ironsights Armory" },
    { id: "poi:dealership", x: -45, z: 70, kind: "dealership", label: "Verano Motors" },
    { id: "poi:safehouse", x: -300, z: -250, kind: "safehouse", label: "Safehouse" },
    { id: "poi:atm", x: 40, z: -35, kind: "poi", label: "ATM / Bank" },
    { id: "poi:helipad", x: LANDMARKS.helipad.x, z: LANDMARKS.helipad.z, kind: "vehicle", label: "Helipad" },
    { id: "poi:airstrip", x: LANDMARKS.runway.x, z: LANDMARKS.runway.z, kind: "vehicle", label: "Airstrip" },
    { id: "poi:marina", x: MARINA.x, z: MARINA.z, kind: "vehicle", label: "Marina" },
    // Landmarks / POIs
    { id: "poi:solaris", x: 0, z: -20, kind: "poi", label: "Solaris Tower" },
    { id: "poi:neon", x: 315, z: 30, kind: "poi", label: "The Neon Mile" },
    { id: "poi:mall", x: 380, z: 150, kind: "shop", label: "Vista Galleria" },
    { id: "poi:stadium", x: 250, z: 265, kind: "poi", label: "Estadio Sol" },
    { id: "poi:pier", x: 95, z: 520, kind: "poi", label: "Sunset Pier" },
    // Services
    { id: "poi:hospital", x: 74, z: -58, kind: "hospital", label: "Vista General" },
    { id: "poi:police", x: -74, z: -32, kind: "police", label: "SVPD HQ" },
    { id: "poi:gas", x: 196, z: 58, kind: "gas", label: "Fuel" },
  ];
  for (const p of pois) {
    try {
      addBlip({ id: p.id, worldPos: { x: p.x, z: p.z }, kind: p.kind, label: p.label });
    } catch {
      /* ignore a single bad blip */
    }
  }

  // ── Mission-giver blips (the chain: First Score → Boardwalk Shakedown → Sunset Run) ─────────
  const givers: Array<{ id: string; x: number; z: number; label: string }> = [
    { id: "mg:m01", x: 8, z: 2, label: "First Score" },
    { id: "mg:m02", x: 26, z: 10, label: "Boardwalk Shakedown" },
    { id: "mg:m03", x: -18, z: -8, label: "Sunset Run" },
    { id: "mg:m04", x: 230, z: 30, label: "Costa Dorada Collection" },
    { id: "mg:m05", x: 330, z: 260, label: "Airfield Getaway" },
  ];
  for (const g of givers) {
    try {
      addBlip({ id: g.id, worldPos: { x: g.x, z: g.z }, kind: "missionGiver", label: g.label, sonar: true });
    } catch {
      /* ignore */
    }
  }

  // Point the player at the very first mission so they immediately know what to do.
  try {
    setWaypoint({ x: 8, z: 2 }, "First Score");
  } catch {
    /* map not ready */
  }

  // ── Moving-entity blips: tag police units + the player's current vehicle so they track live ──
  registerSystem({
    name: "worldContent:movingBlips",
    phase: "finish",
    order: 30,
    fn: () => {
      for (const e of policeQ.entities) {
        if (!e.hud_blip) world.addComponent(e, "hud_blip", { kind: "police", clampToEdge: false });
      }
      const occ = localQ.entities[0]?.vg_occupant;
      for (const v of vehiclesQ.entities) {
        const mine = occ != null && v.netId === occ.vehicleNetId;
        if (mine && !v.hud_blip) {
          world.addComponent(v, "hud_blip", { kind: "vehicle", label: "Your vehicle" });
        } else if (!mine && v.hud_blip?.kind === "vehicle") {
          world.removeComponent(v, "hud_blip");
        }
      }
    },
  });
}
