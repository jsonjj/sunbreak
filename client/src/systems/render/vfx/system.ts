// The VFX render-phase system. Runs inside the R3F frame loop (via SystemsRunner). Each frame
// it: mounts the manager if needed, reads weather, drains one-shot `vfx_emit` queues, pumps the
// continuous emitter components (skid/exhaust/emitter), then integrates + renders everything.
import type { System, Vec3Tuple } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { vfxManager } from "./core/VfxManager";

type W = typeof world;

// Cached archetype queries (miniplex reuses these across frames).
const emitQ = world.with("vfx_emit");
const weatherQ = world.with("vfx_weather");
const skidQ = world.with("vfx_skid", "transform");
const exhaustQ = world.with("vfx_exhaust", "transform");
const emitterQ = world.with("vfx_emitter", "transform");

// Fractional rate accumulators for continuous emitters (keyed by entity; GC-friendly).
const exhaustAcc = new WeakMap<ClientEntity, number>();
const emitterAcc = new WeakMap<ClientEntity, number>();

function planarDir(e: ClientEntity, out: { x: number; z: number }): void {
  const v = e.velocity?.linear;
  if (v && v.x * v.x + v.z * v.z > 0.04) {
    out.x = v.x;
    out.z = v.z;
    return;
  }
  const facing = e.movement?.facing;
  if (facing !== undefined) {
    out.x = Math.sin(facing);
    out.z = Math.cos(facing);
    return;
  }
  out.x = 0;
  out.z = 1;
}

const _dir = { x: 0, z: 1 };

function tick(_w: W, dt: number): void {
  if (!vfxManager.ensureReady()) return;

  // Weather (pull): last writer wins.
  for (const e of weatherQ) vfxManager.setWeather(e.vfx_weather);

  // One-shot events: drain + clear every entity's queue.
  for (const e of emitQ) {
    const q = e.vfx_emit;
    if (q.length === 0) continue;
    for (let i = 0; i < q.length; i++) vfxManager.spawn(q[i]!);
    q.length = 0;
  }

  // Continuous skid: lay a decal segment under each active wheel contact.
  for (const e of skidQ) {
    const s = e.vfx_skid;
    if (!s.active || s.points.length === 0) continue;
    planarDir(e, _dir);
    const intensity = s.opacity ?? 0.6;
    const width = s.width ?? 0.22;
    for (let i = 0; i < s.points.length; i++) {
      const p = s.points[i]!;
      vfxManager.pumpSkid(p[0], p[1], p[2], _dir.x, _dir.z, intensity, width / 0.22, s.smoke ?? false);
    }
  }

  // Continuous exhaust: rate-accumulated puffs at transform + offset.
  for (const e of exhaustQ) {
    const ex = e.vfx_exhaust;
    if (ex.enabled === false) continue;
    const pos = e.transform.position;
    const off = ex.offset;
    const rate = ex.rate ?? 18;
    let acc = (exhaustAcc.get(e) ?? 0) + rate * dt;
    let n = Math.floor(acc);
    if (n > 6) n = 6;
    acc -= n;
    exhaustAcc.set(e, acc);
    for (let i = 0; i < n; i++) {
      vfxManager.pumpExhaust(pos.x + off[0], pos.y + off[1], pos.z + off[2], ex.color);
    }
  }

  // Generic ambient emitter: dust / smoke / fire / sparks at a fixed rate.
  for (const e of emitterQ) {
    const em = e.vfx_emitter;
    if (em.enabled === false) continue;
    const pos = e.transform.position;
    const off: Vec3Tuple = em.offset ?? [0, 0, 0];
    const scale = em.scale ?? 1;
    let acc = (emitterAcc.get(e) ?? 0) + em.rate * dt;
    let n = Math.floor(acc);
    if (n > 8) n = 8;
    acc -= n;
    emitterAcc.set(e, acc);
    const x = pos.x + off[0];
    const y = pos.y + off[1];
    const z = pos.z + off[2];
    for (let i = 0; i < n; i++) {
      if (em.kind === "dust") vfxManager.pumpDust(x, y, z, scale, em.color);
      else if (em.kind === "sparks" || em.kind === "fire") vfxManager.pumpSpark(x, y, z, scale, em.color);
      else vfxManager.pumpSmoke(x, y, z, scale, em.color);
    }
  }

  vfxManager.update(dt);
}

/** Registered by index.ts. Runs in the `render` phase (view-only, after gameplay `update`). */
export const vfxSystem: System<W> = {
  name: "render/vfx",
  phase: "render",
  order: 50,
  fn: tick,
};
