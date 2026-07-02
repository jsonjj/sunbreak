// Delivery / taxi gig — chained pickup→dropoff legs. One node is active at a time (current
// pickup or its dropoff). Leg payouts accumulate into run.score and are paid out by rewards on
// success; time tiers add a completion bonus. Impact-damage penalties are a Vehicles-dependent
// extension (noted for the integrator) — the leg-sequencing core is complete here.

import type { KindController, ObjectiveTick, RunContext } from "../runtime/types";
import type { DeliveryActivityDef } from "../types";
import type { Vec3 } from "@sunbreak/shared";
import { evaluators } from "../runtime/objectives";
import { despawnNode, despawnRunNodes, spawnNode } from "../spawn";
import { withinPlanar } from "../util";

const DEFAULT_LEG_RADIUS = 6;

type Phase = "pickup" | "dropoff";

const phaseOf = (ctx: RunContext): Phase => (ctx.run.scratch.phase as Phase) ?? "pickup";

function spawnLegNode(ctx: RunContext, phase: Phase): void {
  const def = ctx.run.def as DeliveryActivityDef;
  const leg = def.legs[ctx.run.index];
  if (!leg) return;
  const pos = phase === "pickup" ? leg.pickup : leg.dropoff;
  const node = spawnNode(
    {
      runId: ctx.run.runId,
      role: phase,
      index: ctx.run.index,
      radius: leg.radius ?? DEFAULT_LEG_RADIUS,
    },
    pos,
    true,
  );
  ctx.run.nodes = [node];
  ctx.run.scratch.phase = phase;
}

const objectiveText = (ctx: RunContext): string => {
  const def = ctx.run.def as DeliveryActivityDef;
  const n = def.legs.length;
  const verb = phaseOf(ctx) === "pickup" ? "pick up cargo" : "deliver cargo";
  return `Leg ${Math.min(ctx.run.index + 1, n)}/${n}: ${verb}`;
};

export const deliveryController: KindController = {
  kind: "delivery",

  start(ctx: RunContext) {
    const def = ctx.run.def as DeliveryActivityDef;
    ctx.run.index = 0;
    ctx.run.score = 0;
    ctx.run.total = def.legs.length;
    ctx.run.progress = 0;
    ctx.run.scratch.phase = "pickup";
    spawnLegNode(ctx, "pickup");
    ctx.run.objectiveText = objectiveText(ctx);
  },

  tick(ctx: RunContext): ObjectiveTick {
    const def = ctx.run.def as DeliveryActivityDef;
    const n = def.legs.length;
    const remainingMs = ctx.run.timeLimitMs ?? Infinity;
    const pos = ctx.playerPos();
    const node = ctx.run.nodes[0];

    if (pos && node?.transform && ctx.run.index < n) {
      const radius = node.act_node?.radius ?? DEFAULT_LEG_RADIUS;
      if (withinPlanar(pos, node.transform.position, radius)) {
        despawnNode(node);
        if (phaseOf(ctx) === "pickup") {
          spawnLegNode(ctx, "dropoff");
        } else {
          ctx.run.score += def.legs[ctx.run.index]?.payout ?? 0;
          ctx.run.index += 1;
          ctx.run.progress = ctx.run.index;
          if (ctx.run.index < n) spawnLegNode(ctx, "pickup");
          else ctx.run.nodes = [];
        }
      }
    }

    const active = ctx.run.nodes[0];
    const waypoint: Vec3 | null = active?.transform ? { ...active.transform.position } : null;

    const ev = evaluators.deliver({
      index: ctx.run.index,
      count: n,
      score: 0,
      goal: 0,
      remainingMs,
    });

    return {
      progress: ctx.run.index,
      total: n,
      score: ctx.run.score,
      text: objectiveText(ctx),
      done: ev.done,
      failed: ev.failed,
      waypoint,
    };
  },

  cleanup(ctx: RunContext) {
    for (const node of ctx.run.nodes) despawnNode(node);
    despawnRunNodes(ctx.run.runId);
    ctx.run.nodes = [];
  },
};
