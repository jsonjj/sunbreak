// Rampage / score — smash N scored targets before the clock runs out. Targets are ECS nodes;
// by default a target is "smashed" when the player reaches it (works today with no Combat dep).
// When Combat lands it can instead call the exposed activitiesApi.notifyHit(pos) to score hits
// at range — the tallying path is identical.

import type { KindController, ObjectiveTick, RunContext } from "../runtime/types";
import type { RampageActivityDef } from "../types";
import type { Vec3 } from "@sunbreak/shared";
import { evaluators } from "../runtime/objectives";
import { despawnNode, despawnRunNodes, spawnNode } from "../spawn";
import { planarDist2, withinPlanar } from "../util";

const DEFAULT_TARGET_RADIUS = 5;

/** Blip id for a rampage target. Exported so the runtime's combat hit-hook can remove it too. */
export const targetBlipId = (runId: string, index: number): string => `act_tgt_${runId}_${index}`;

function spawnBatch(ctx: RunContext): void {
  const def = ctx.run.def as RampageActivityDef;
  ctx.run.nodes = def.targets.map((t, i) => {
    const node = spawnNode(
      {
        runId: ctx.run.runId,
        role: "target",
        index: i,
        radius: t.radius ?? DEFAULT_TARGET_RADIUS,
        value: t.value ?? 1,
      },
      t.pos,
      true,
    );
    ctx.blips.upsert({ id: targetBlipId(ctx.run.runId, i), x: t.pos[0], z: t.pos[2], kind: "enemy" });
    return node;
  });
}

function smash(ctx: RunContext, arrayIndex: number): void {
  const node = ctx.run.nodes[arrayIndex];
  if (!node) return;
  ctx.run.score += node.act_node?.value ?? 1;
  ctx.blips.remove(targetBlipId(ctx.run.runId, node.act_node?.index ?? arrayIndex));
  despawnNode(node);
  ctx.run.nodes.splice(arrayIndex, 1);
}

export const rampageController: KindController = {
  kind: "rampage",

  start(ctx: RunContext) {
    const def = ctx.run.def as RampageActivityDef;
    ctx.run.score = 0;
    ctx.run.total = def.goal;
    ctx.run.progress = 0;
    ctx.run.index = 0;
    ctx.run.objectiveText = `Smash targets: 0/${def.goal}`;
    spawnBatch(ctx);
  },

  tick(ctx: RunContext): ObjectiveTick {
    const def = ctx.run.def as RampageActivityDef;
    const remainingMs = ctx.run.timeLimitMs ?? Infinity;
    const pos = ctx.playerPos();

    if (pos) {
      // Iterate backwards so splices during smash() stay valid.
      for (let i = ctx.run.nodes.length - 1; i >= 0; i--) {
        const node = ctx.run.nodes[i];
        const radius = node?.act_node?.radius ?? DEFAULT_TARGET_RADIUS;
        if (node?.transform && withinPlanar(pos, node.transform.position, radius)) smash(ctx, i);
      }
      if (def.respawn && ctx.run.nodes.length === 0 && ctx.run.score < def.goal) spawnBatch(ctx);
    }

    // Nearest remaining target guides the waypoint blip.
    let waypoint: Vec3 | null = null;
    if (pos && ctx.run.nodes.length) {
      let best = Infinity;
      for (const node of ctx.run.nodes) {
        if (!node.transform) continue;
        const d = planarDist2(pos, node.transform.position);
        if (d < best) {
          best = d;
          waypoint = { ...node.transform.position };
        }
      }
    }

    const ev = evaluators.score({
      index: 0,
      count: 0,
      score: ctx.run.score,
      goal: def.goal,
      remainingMs,
    });

    return {
      progress: ctx.run.score,
      total: def.goal,
      score: ctx.run.score,
      text: `Smash targets: ${ctx.run.score}/${def.goal}`,
      done: ev.done,
      failed: ev.failed,
      waypoint,
    };
  },

  cleanup(ctx: RunContext) {
    for (const node of ctx.run.nodes) {
      ctx.blips.remove(targetBlipId(ctx.run.runId, node.act_node?.index ?? 0));
      despawnNode(node);
    }
    despawnRunNodes(ctx.run.runId);
    ctx.run.nodes = [];
  },
};
