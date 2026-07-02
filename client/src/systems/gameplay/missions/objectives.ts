// Objective handler registry. One entry per objective kind; each returns pending/complete/failed.
//
// Handlers are event-driven where a producer exists (interact / vehicleEntered / itemCollected via
// the bus) and fall back to cheap self-contained checks (proximity, ECS survivor counts) so every
// objective is completable TODAY, before combat/vehicle/interaction subsystems land.

import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { Objective, Vec3 } from "./schema";
import type { MissionCtx, ObjectiveHandler, ObjectiveResult, ObjectiveRuntime } from "./types";
import { signals } from "./signals";
import { getObjectivePredicate } from "./registries";
import { centroid, entityPos, firstSpawn, isAlive, spawnEntities } from "./queries";
import { vec3ToTuple, withinXZ } from "./util";

const collectQuery = world.with("mission_collectRef", "transform");
const targetQuery = world.with("mission_targetId", "transform");

// Typed wrapper: dispatch guarantees the kind, so we narrow the generic `Objective` once here.
function handler<K extends Objective["kind"]>(
  impl: {
    onEnter?: (o: Extract<Objective, { kind: K }>, ctx: MissionCtx, rt: ObjectiveRuntime, ref: string) => void;
    evaluate: (o: Extract<Objective, { kind: K }>, ctx: MissionCtx, rt: ObjectiveRuntime, ref: string, dt: number) => ObjectiveResult;
    markerPosition?: (o: Extract<Objective, { kind: K }>, ctx: MissionCtx, ref: string) => Vec3 | null;
  },
): ObjectiveHandler {
  type Narrowed = Extract<Objective, { kind: K }>;
  return {
    onEnter: impl.onEnter ? (o, ctx, rt, ref) => impl.onEnter!(o as Narrowed, ctx, rt, ref) : undefined,
    evaluate: (o, ctx, rt, ref, dt) => impl.evaluate(o as Narrowed, ctx, rt, ref, dt),
    markerPosition: impl.markerPosition ? (o, ctx, ref) => impl.markerPosition!(o as Narrowed, ctx, ref) : undefined,
  };
}

/** Count of eliminate targets still alive for a mission run. */
function aliveTargets(o: Extract<Objective, { kind: "eliminate" }>, ref: string): number {
  const refs = Array.isArray(o.targets) ? o.targets : [o.targets.spawnRef];
  let n = 0;
  for (const r of refs) for (const e of spawnEntities(ref, r)) if (isAlive(e)) n++;
  return n;
}
function targetEntities(o: Extract<Objective, { kind: "eliminate" }>, ref: string): ClientEntity[] {
  const refs = Array.isArray(o.targets) ? o.targets : [o.targets.spawnRef];
  return refs.flatMap((r) => spawnEntities(ref, r).filter(isAlive));
}

/** Resolve the world position an interact target sits at (spawned prop, tagged entity, or literal). */
function interactPos(o: Extract<Objective, { kind: "interact" }>, ref: string): Vec3 | null {
  if (o.position) return o.position;
  const spawned = firstSpawn(ref, o.targetId);
  if (spawned) return entityPos(spawned);
  for (const e of targetQuery) if (e.mission_targetId === o.targetId) return vec3ToTuple(e.transform.position);
  return null;
}

const DWELL_SECONDS = 0.6;

export const objectiveHandlers: Record<Objective["kind"], ObjectiveHandler> = {
  goto: handler<"goto">({
    evaluate: (o, ctx) => {
      if (o.inVehicle && !ctx.player.inVehicleRef()) return "pending";
      return withinXZ(ctx.player.position(), o.position, o.radius) ? "complete" : "pending";
    },
    markerPosition: (o) => o.position,
  }),

  escape: handler<"escape">({
    evaluate: (o, ctx) => {
      if (o.inVehicle && !ctx.player.inVehicleRef()) return "pending";
      return withinXZ(ctx.player.position(), o.position, o.radius) ? "pending" : "complete";
    },
  }),

  wait: handler<"wait">({
    evaluate: (o, _ctx, rt, _ref, dt) => {
      rt.elapsed += dt;
      return rt.elapsed >= o.seconds ? "complete" : "pending";
    },
  }),

  survive: handler<"survive">({
    evaluate: (o, _ctx, rt, _ref, dt) => {
      rt.elapsed += dt;
      rt.data.remaining = Math.max(0, o.seconds - rt.elapsed);
      return rt.elapsed >= o.seconds ? "complete" : "pending";
    },
  }),

  interact: handler<"interact">({
    evaluate: (o, ctx, rt, ref, dt) => {
      // 1) Real interact event from the interaction subsystem.
      if (signals.interacts.has(o.targetId)) return "complete";
      // 2) Self-contained fallback: walk up and dwell in range.
      const pos = interactPos(o, ref);
      if (pos && withinXZ(ctx.player.position(), pos, o.radius ?? 2.5)) {
        rt.elapsed += dt;
        if (rt.elapsed >= DWELL_SECONDS) return "complete";
      } else {
        rt.elapsed = 0;
      }
      return "pending";
    },
    markerPosition: (o, _ctx, ref) => interactPos(o, ref),
  }),

  enterVehicle: handler<"enterVehicle">({
    evaluate: (o, ctx, _rt, ref) => {
      if (signals.vehiclesEntered.has(o.vehicleRef)) return "complete";
      if (ctx.player.inVehicleRef() === o.vehicleRef) return "complete";
      // Fallback: reach the spawned vehicle.
      const v = firstSpawn(ref, o.vehicleRef);
      const p = v ? entityPos(v) : null;
      if (p && withinXZ(ctx.player.position(), p, 3.0)) return "complete";
      return "pending";
    },
    markerPosition: (o, _ctx, ref) => {
      const v = firstSpawn(ref, o.vehicleRef);
      return v ? entityPos(v) : null;
    },
  }),

  collect: handler<"collect">({
    onEnter: (o, _ctx, rt, ref) => {
      rt.baseline = o.count ?? spawnEntities(ref, o.itemRef).length;
      rt.data.collected = 0;
    },
    evaluate: (o, ctx, rt, ref) => {
      const need = o.count ?? Math.max(1, rt.baseline);
      const r = o.radius ?? 2.0;
      const at = ctx.player.position();
      for (const p of [...collectQuery]) {
        if (p.mission_ref !== ref || p.mission_collectRef !== o.itemRef) continue;
        if (withinXZ(at, vec3ToTuple(p.transform.position), r)) {
          world.remove(p);
          rt.data.collected = (rt.data.collected ?? 0) + 1;
          ctx.events.emit("itemCollected", { itemRef: o.itemRef });
        }
      }
      if (signals.itemsCollected.has(o.itemRef) && (rt.data.collected ?? 0) === 0) {
        // External pickup (inventory subsystem) with no local props — treat as satisfied.
        rt.data.collected = need;
      }
      rt.data.need = need;
      return (rt.data.collected ?? 0) >= need ? "complete" : "pending";
    },
    markerPosition: (o, _ctx, ref) => {
      for (const p of collectQuery) {
        if (p.mission_ref === ref && p.mission_collectRef === o.itemRef) return vec3ToTuple(p.transform.position);
      }
      return o.position ?? null;
    },
  }),

  eliminate: handler<"eliminate">({
    onEnter: (o, _ctx, rt, ref) => {
      rt.baseline = aliveTargets(o, ref);
    },
    evaluate: (o, _ctx, rt, ref) => {
      const alive = aliveTargets(o, ref);
      const need = o.count ?? Math.max(1, rt.baseline);
      const killed = Math.max(0, rt.baseline - alive);
      rt.data.killed = killed;
      rt.data.need = need;
      return killed >= need ? "complete" : "pending";
    },
    markerPosition: (o, _ctx, ref) => centroid(targetEntities(o, ref)),
  }),

  // Protect is treated as a guard by the runtime (it never gates completion and its
  // `protectedDied` fail state is auto-registered). The handler only supplies a follow marker.
  protect: handler<"protect">({
    evaluate: () => "pending",
    markerPosition: (o, _ctx, ref) => {
      const e = firstSpawn(ref, o.entityRef);
      return e ? entityPos(e) : null;
    },
  }),

  custom: handler<"custom">({
    evaluate: (o, ctx) => {
      const fn = getObjectivePredicate(o.predicateId);
      if (!fn) return "pending";
      return fn(ctx) ? "complete" : "pending";
    },
  }),
};
