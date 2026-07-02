// Pluggable registries for the `custom` escape hatches (actions, objective predicates, fail
// predicates). Empty by default; other subsystems (or advanced missions) register handlers so
// data-driven missions can reach engine code without editing the runtime.

import type { MissionCtx } from "./types";

export type CustomAction = (args: Record<string, unknown> | undefined, ctx: MissionCtx) => void;
export type MissionPredicate = (ctx: MissionCtx) => boolean;

const customActions = new Map<string, CustomAction>();
const objectivePredicates = new Map<string, MissionPredicate>();
const failPredicates = new Map<string, MissionPredicate>();

export function registerCustomAction(id: string, fn: CustomAction): () => void {
  customActions.set(id, fn);
  return () => customActions.delete(id);
}
export function runCustomAction(id: string, args: Record<string, unknown> | undefined, ctx: MissionCtx): void {
  const fn = customActions.get(id);
  if (fn) fn(args, ctx);
  else console.warn(`[missions] no custom action registered for "${id}"`);
}

/** Objective predicate for `{ kind: "custom", predicateId }` — true = objective complete. */
export function registerObjectivePredicate(id: string, fn: MissionPredicate): () => void {
  objectivePredicates.set(id, fn);
  return () => objectivePredicates.delete(id);
}
export function getObjectivePredicate(id: string): MissionPredicate | undefined {
  return objectivePredicates.get(id);
}

/** Fail predicate for `{ kind: "predicate", id }` — true = mission failed. */
export function registerFailPredicate(id: string, fn: MissionPredicate): () => void {
  failPredicates.set(id, fn);
  return () => failPredicates.delete(id);
}
export function getFailPredicate(id: string): MissionPredicate | undefined {
  return failPredicates.get(id);
}
