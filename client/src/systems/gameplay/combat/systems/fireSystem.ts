// UPDATE-phase fire loop. Reads aim/fire/reload from the shared input snapshot, resolves the
// equipped weapon from inventory, gates by fire-rate + ammo + reload FSM, then hitscans (Rapier +
// analytic capsule), throws a projectile, or swings melee. Damage/death is applied via `applyHit`.

import type { System } from "@sunbreak/shared";
import { DEG2RAD, InputAction } from "@sunbreak/shared";
import { input } from "@/input/InputManager";
import { queries } from "@/ecs/queries";
import type { ClientEntity } from "@/ecs/clientEntity";
import { world } from "@/ecs/world";
import { fireIntervalMs, getCombatWeapon, type WeaponBallistics } from "../weapons";
import { computeDamage } from "../damage";
import { castCombatRay, forEachDamageableNear } from "../hitscan";
import { applyHit } from "../resolve";
import {
  getAim,
  getMuzzle,
  playerForward,
  pushImpact,
  pushMuzzle,
  pushTracer,
  type Aim,
} from "../runtime";
import { canReload, readEquipped, reloadEquipped, setReloadingTag, spendRound } from "../integrations/inventory";
import { spawnProjectile } from "./projectileSystem";
import { MOVE_SPREAD_MULT } from "../constants";

type W = typeof world;

const BLOOM_DECAY_PER_S = 2.5;
const BLOOM_MAX_SPREAD_DEG = 4.5;
const MELEE_CONE_COS = Math.cos(70 * DEG2RAD);

// Module scratch — zero per-frame allocation.
const aim: Aim = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
const muzzle = { x: 0, y: 0, z: 0 };
const pelletDir = { x: 0, y: 0, z: 0 };
const fwd = { x: 0, z: 0 };

/** Perturb a unit direction within a cone of `spreadRad` (returns a fresh unit vector in `out`). */
function spreadDir(
  dx: number,
  dy: number,
  dz: number,
  spreadRad: number,
  out: { x: number; y: number; z: number },
): void {
  if (spreadRad <= 1e-5) {
    out.x = dx;
    out.y = dy;
    out.z = dz;
    return;
  }
  // Basis perpendicular to the aim direction.
  let ux: number, uy: number, uz: number;
  if (Math.abs(dy) < 0.99) {
    // u = normalize(dir × up)
    ux = dz;
    uy = 0;
    uz = -dx;
  } else {
    ux = 1;
    uy = 0;
    uz = 0;
  }
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  // v = dir × u
  const vx = dy * uz - dz * uy;
  const vy = dz * ux - dx * uz;
  const vz = dx * uy - dy * ux;
  const r = spreadRad * Math.sqrt(Math.random());
  const theta = Math.random() * Math.PI * 2;
  const m = Math.tan(r);
  const ox = dx + (ux * Math.cos(theta) + vx * Math.sin(theta)) * m;
  const oy = dy + (uy * Math.cos(theta) + vy * Math.sin(theta)) * m;
  const oz = dz + (uz * Math.cos(theta) + vz * Math.sin(theta)) * m;
  const l = Math.hypot(ox, oy, oz) || 1;
  out.x = ox / l;
  out.y = oy / l;
  out.z = oz / l;
}

function ensureRuntime(player: ClientEntity): NonNullable<ClientEntity["combat_weapon"]> {
  if (!player.combat_weapon) {
    world.addComponent(player, "combat_weapon", {
      weaponId: "",
      state: "ready",
      lastShotAt: 0,
      reloadEndsAt: 0,
      triggerWasDown: false,
      bloom: 0,
    });
  }
  return player.combat_weapon!;
}

function doMelee(player: ClientEntity, b: WeaponBallistics, weaponId: string, attackerNetId?: number): void {
  const t = player.transform;
  if (!t || !playerForward(fwd)) return;
  const px = t.position.x;
  const py = t.position.y;
  const pz = t.position.z;
  let best: ClientEntity | null = null;
  let bestD = Infinity;
  forEachDamageableNear(
    px,
    py,
    pz,
    b.rangeM,
    (e, d) => {
      const et = e.transform!;
      let tx = et.position.x - px;
      let tz = et.position.z - pz;
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      if (tx * fwd.x + tz * fwd.z < MELEE_CONE_COS) return; // outside the swing cone
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    },
    player,
  );
  if (!best) return;
  const victim: ClientEntity = best;
  const vt = victim.transform;
  if (!vt) return;
  applyHit({
    target: victim,
    weaponId,
    amount: computeDamage(b, bestD, "torso"),
    zone: "torso",
    point: { x: vt.position.x, y: vt.position.y, z: vt.position.z },
    normal: { x: -fwd.x, y: 0, z: -fwd.z },
    dir: { x: fwd.x, y: 0, z: fwd.z },
    impulse: b.impulse,
    melee: true,
    attackerNetId,
    impactVfx: true,
  });
}

export const fireSystem: System<W> = {
  name: "combat.fire",
  phase: "update",
  order: 0,
  fn: (_w, dt) => {
    const player = queries.players.entities[0];
    if (!player) return;

    const rt = ensureRuntime(player);
    const now = performance.now();

    // Trigger edge (needed for semi-auto) — update the stored state up-front for every path.
    const fireDown = input.isActionDown(InputAction.Fire);
    const prevTrigger = rt.triggerWasDown;
    rt.triggerWasDown = fireDown;

    const eq = readEquipped(player);
    if (!eq) return;

    // Weapon switch → reset the firing FSM.
    if (eq.weaponId !== rt.weaponId) {
      rt.weaponId = eq.weaponId;
      rt.state = "ready";
      rt.reloadEndsAt = 0;
      rt.bloom = 0;
      setReloadingTag(player, false);
    }

    const b = getCombatWeapon(eq.weaponId);
    const attackerNetId = player.netId ?? 1;

    // Bloom decays whenever we're not adding to it.
    if (rt.bloom > 0) rt.bloom = Math.max(0, rt.bloom - dt * BLOOM_DECAY_PER_S);

    // ── Reload FSM ────────────────────────────────────────────────────────────────────────────
    if (rt.state === "reloading") {
      if (now >= rt.reloadEndsAt) {
        reloadEquipped();
        setReloadingTag(player, false);
        rt.state = "ready";
      }
      return; // no firing mid-reload
    }

    const reloadPressed = input.snapshot.justPressed.has(InputAction.Reload);
    const wantReload = reloadPressed || (fireDown && !prevTrigger && eq.mag <= 0 && !eq.isMelee);
    if (wantReload && canReload(eq)) {
      rt.state = "reloading";
      rt.reloadEndsAt = now + b.reloadMs;
      setReloadingTag(player, true);
      return;
    }

    // ── Fire gating ───────────────────────────────────────────────────────────────────────────
    const wantFire = b.auto ? fireDown : fireDown && !prevTrigger;
    if (!wantFire) return;
    if (now - rt.lastShotAt < fireIntervalMs(b)) return;
    if (!eq.isMelee && eq.mag <= 0) return; // empty; the auto-reload branch above handles it

    rt.lastShotAt = now;
    if (!eq.isMelee && !spendRound(1)) return; // inventory is the ammo authority

    rt.bloom = Math.min(1, rt.bloom + b.bloom);
    if (!getAim(aim)) return;

    if (b.fireMode === "melee") {
      doMelee(player, b, eq.weaponId, attackerNetId);
      return;
    }

    getMuzzle(muzzle);
    pushMuzzle({ x: muzzle.x, y: muzzle.y, z: muzzle.z });

    if (b.fireMode === "projectile") {
      spawnProjectile(player, aim, b, eq.weaponId, now);
      return;
    }

    // ── Hitscan (single ray or shotgun pellets) ─────────────────────────────────────────────────
    const aimDown = input.isActionDown(InputAction.Aim);
    const moving = (player.movement?.speed ?? 0) > 0.6;
    const spreadDeg =
      b.spreadDeg * (aimDown ? b.adsSpreadMul : 1) * (moving ? MOVE_SPREAD_MULT : 1) +
      rt.bloom * BLOOM_MAX_SPREAD_DEG;
    const spreadRad = spreadDeg * DEG2RAD;

    for (let p = 0; p < b.pellets; p++) {
      spreadDir(aim.dx, aim.dy, aim.dz, spreadRad, pelletDir);
      const hit = castCombatRay(aim.ox, aim.oy, aim.oz, pelletDir.x, pelletDir.y, pelletDir.z, b.rangeM, player);
      pushTracer({ x0: muzzle.x, y0: muzzle.y, z0: muzzle.z, x1: hit.point.x, y1: hit.point.y, z1: hit.point.z });
      if (hit.entity) {
        applyHit({
          target: hit.entity,
          weaponId: eq.weaponId,
          amount: computeDamage(b, hit.distance, hit.zone),
          zone: hit.zone,
          point: hit.point,
          normal: hit.normal,
          dir: { x: pelletDir.x, y: pelletDir.y, z: pelletDir.z },
          impulse: b.impulse,
          melee: false,
          attackerNetId,
          impactVfx: true,
        });
      } else if (hit.hitSolid) {
        // Wall/prop spark (no actor struck).
        pushImpact({
          x: hit.point.x,
          y: hit.point.y,
          z: hit.point.z,
          nx: hit.normal.x,
          ny: hit.normal.y,
          nz: hit.normal.z,
          surface: "concrete",
        });
      }
    }
  },
};
