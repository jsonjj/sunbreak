// Street race — sequential checkpoint circuits & point-to-point sprints. Time-trial model
// (no AI racers): pass the armed checkpoint to advance; circuits loop the checkpoint set for
// `laps`. Only the current checkpoint is armed at a time (perf: one active sensor equivalent).

import type { KindController, ObjectiveTick, RunContext } from "../runtime/types";
import type { RaceActivityDef } from "../types";
import { evaluators } from "../runtime/objectives";
import { armNode, despawnNode, despawnRunNodes, spawnNode } from "../spawn";
import { tupleToVec3, withinPlanar } from "../util";

const DEFAULT_CP_RADIUS = 7;

const lapsOf = (def: RaceActivityDef): number =>
  def.mode === "circuit" ? Math.max(1, def.laps ?? 1) : 1;

const objectiveText = (def: RaceActivityDef, index: number): string => {
  const length = def.checkpoints.length;
  const laps = lapsOf(def);
  const total = length * laps;
  const nextCp = Math.min(index + 1, total);
  if (def.mode === "circuit") {
    const lap = Math.min(laps, Math.floor(index / length) + 1);
    const cpInLap = (index % length) + 1;
    return `Lap ${lap}/${laps} · Checkpoint ${cpInLap}/${length}`;
  }
  return `Checkpoint ${nextCp}/${total}`;
};

export const raceController: KindController = {
  kind: "race",

  start(ctx: RunContext) {
    const def = ctx.run.def as RaceActivityDef;
    const total = def.checkpoints.length * lapsOf(def);
    ctx.run.index = 0;
    ctx.run.lap = 0;
    ctx.run.total = total;
    ctx.run.progress = 0;
    ctx.run.score = 0;
    ctx.run.objectiveText = objectiveText(def, 0);
    ctx.run.nodes = def.checkpoints.map((cp, i) =>
      spawnNode(
        { runId: ctx.run.runId, role: "checkpoint", index: i, radius: cp.radius ?? DEFAULT_CP_RADIUS },
        cp.pos,
        i === 0,
      ),
    );
  },

  tick(ctx: RunContext): ObjectiveTick {
    const def = ctx.run.def as RaceActivityDef;
    const length = def.checkpoints.length;
    const total = length * lapsOf(def);
    const remainingMs = ctx.run.timeLimitMs ?? Infinity;
    const pos = ctx.playerPos();

    if (pos && ctx.run.index < total) {
      const cpIdx = ctx.run.index % length;
      const node = ctx.run.nodes[cpIdx];
      const radius = def.checkpoints[cpIdx]?.radius ?? DEFAULT_CP_RADIUS;
      if (node?.transform && withinPlanar(pos, node.transform.position, radius)) {
        armNode(node, false);
        ctx.run.index += 1;
        ctx.run.lap = Math.floor(ctx.run.index / length);
        if (ctx.run.index < total) {
          const next = ctx.run.nodes[ctx.run.index % length];
          if (next) armNode(next, true);
        }
      }
    }

    const ev = evaluators.reach({ index: ctx.run.index, count: total, score: 0, goal: 0, remainingMs });
    const waypoint =
      ctx.run.index < total ? tupleToVec3(def.checkpoints[ctx.run.index % length]!.pos) : null;

    return {
      progress: ctx.run.index,
      total,
      score: 0,
      text: objectiveText(def, ctx.run.index),
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
