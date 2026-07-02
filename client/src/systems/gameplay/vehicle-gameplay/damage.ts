// Gameplay-side durability: HP model, damage-stage thresholds, and engine-health coupling.
// Physics realizes the perf cap by reading `veh_engineHealth01`. Radius damage to peds/players
// and explosion VFX are delegated (combat + vfx read `vg_health.stage`) — we only own the model.

import type { ClientEntity } from "@/ecs/clientEntity";
import {
  ENGINE_FLOOR01,
  ENGINE_HEALTHY_AT01,
  FIRE_AT01,
  HIT_COOLDOWN_SEC,
  SMOKE_AT01,
  getSpec,
} from "./config";
import { getVehicle, vgQueries } from "./queries";
import { emptyDriverInput, type VehicleDamageStage, type VehicleHealth } from "./types";
import { clamp, clamp01, lerp, nowSec } from "./util";

type Target = number | ClientEntity;

const resolve = (t: Target): ClientEntity | undefined =>
  typeof t === "number" ? getVehicle(t) : t;

/** Fresh full-health state for a spec. */
export function initHealth(specId: ClientEntity["veh_spec"]): VehicleHealth {
  const maxHp = specId ? getSpec(specId).maxHp : 1000;
  return {
    hp: maxHp,
    maxHp,
    engineHealth: 1,
    stage: "ok",
    lastHitAtSec: 0,
    wreckedAtSec: 0,
  };
}

const stageFor = (h: VehicleHealth): VehicleDamageStage => {
  if (h.hp <= 0) return "wrecked";
  const hp01 = h.hp / h.maxHp;
  if (hp01 <= FIRE_AT01) return "burning";
  if (hp01 <= SMOKE_AT01) return "smoking";
  return "ok";
};

/** 0..1 engine performance from current hp (fed to physics via veh_engineHealth01). */
const engineHealthFor = (h: VehicleHealth): number => {
  if (h.stage === "wrecked" || h.hp <= 0) return 0;
  const hp01 = clamp01(h.hp / h.maxHp);
  return clamp01(lerp(ENGINE_FLOOR01, 1, clamp01(hp01 / ENGINE_HEALTHY_AT01)));
};

function wreck(e: ClientEntity, h: VehicleHealth, now: number): void {
  h.hp = 0;
  h.stage = "wrecked";
  h.engineHealth = 0;
  h.wreckedAtSec = now;
  e.veh_engineHealth = 0;
  if (e.vehicle) e.vehicle.engineOn = false;
  // Park the wreck so physics (if present) holds it still.
  e.veh_input = { ...emptyDriverInput(), handbrake: true };
}

/** Public: apply `amount` HP of damage. Returns true if this hit wrecked the vehicle. */
export function applyVehicleDamage(target: Target, amount: number): boolean {
  const e = resolve(target);
  const h = e?.vg_health;
  if (!e || !h || h.stage === "wrecked" || amount <= 0) return false;
  h.hp = clamp(h.hp - amount, 0, h.maxHp);
  h.lastHitAtSec = nowSec();
  if (h.hp <= 0) {
    wreck(e, h, h.lastHitAtSec);
    return true;
  }
  h.stage = stageFor(h);
  return false;
}

/** Public: apply damage from a physics contact impulse, debounced to avoid GC/spam. */
export function applyContactDamage(target: Target, impulse: number, threshold: number, k: number): void {
  const e = resolve(target);
  const h = e?.vg_health;
  if (!e || !h) return;
  const now = nowSec();
  if (now - h.lastHitAtSec < HIT_COOLDOWN_SEC) return;
  const dmg = Math.max(0, impulse - threshold) * k;
  if (dmg > 0) applyVehicleDamage(e, dmg);
}

/** Public: instantly destroy a vehicle (fuel-tank hit / scripted). VFX/combat react to stage. */
export function explodeVehicle(target: Target): void {
  const e = resolve(target);
  const h = e?.vg_health;
  if (!e || !h || h.stage === "wrecked") return;
  wreck(e, h, nowSec());
}

/** Update phase: keep stage + engine-health coupled to current hp every tick. */
export function damageSystem(): void {
  for (const e of vgQueries.vehicles.entities) {
    const h = e.vg_health;
    if (!h) continue;
    if (h.stage !== "wrecked") h.stage = stageFor(h);
    const eh = engineHealthFor(h);
    h.engineHealth = eh;
    e.veh_engineHealth = eh;
  }
}
