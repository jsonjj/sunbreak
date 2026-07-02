// Focus arbitration — the throttled loop that decides which in-range interactable is focused and
// publishes its prompt. Event-driven sensors are a hint; DISTANCE is truth (spec), so we validate
// distance every tick and prune stragglers from any missed sensor-exit. Zero per-frame allocation
// in the hot path (reused scratch vectors).

import * as THREE from "three";
import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { PlayerRef, PromptData, RapierAPI } from "./types";
import { getHandler } from "./registry";
import { useInteractionStore } from "./store";
import { interactionEvents } from "./events";
import {
  entityPosition,
  getFocusedEntity,
  getPlayerRef,
  getRapier,
  interactables,
  resolveId,
  setFocusedEntity,
  viewpoint,
} from "./runtime";
import { makeContext } from "./context";
import {
  ENABLE_LOS,
  EYE_HEIGHT,
  FOCUS_INTERVAL,
  LOS_QUERY_GROUPS,
  rangeFor,
  SCORE_WEIGHTS,
  STALE_RANGE_SLOP,
} from "./constants";

type W = typeof world;

// Scratch — reused every tick.
const origin = new THREE.Vector3();
const forward = new THREE.Vector3();
const toObj = new THREE.Vector3();
const losOrigin = new THREE.Vector3();
const losTarget = new THREE.Vector3();
const losDir = new THREE.Vector3();

let acc = 0;
let lastEmittedFocusId: string | null = null;
let losRay: InstanceType<RapierAPI["Ray"]> | null = null;

function dropInRange(entity: ClientEntity, store = useInteractionStore.getState()): void {
  const id = resolveId(entity);
  if (store.inRange.has(id)) store.removeInRange(id);
  if (entity.interact_inRange) world.removeComponent(entity, "interact_inRange");
}

function commitFocus(entity: ClientEntity, id: string, prompt: PromptData): void {
  const prev = getFocusedEntity();
  if (prev && prev !== entity && prev.interact_focused) {
    world.removeComponent(prev, "interact_focused");
  }
  if (!entity.interact_focused) world.addComponent(entity, "interact_focused", true);
  setFocusedEntity(entity);
  useInteractionStore.getState().setFocus(id, prompt);
  if (lastEmittedFocusId !== id) {
    interactionEvents.emit("focus", { id, kind: entity.interact_?.kind ?? null });
    lastEmittedFocusId = id;
  }
}

function clearFocus(): void {
  const prev = getFocusedEntity();
  if (prev && prev.interact_focused) world.removeComponent(prev, "interact_focused");
  setFocusedEntity(null);
  useInteractionStore.getState().setFocus(null, null);
  if (lastEmittedFocusId !== null) {
    interactionEvents.emit("focus", { id: null, kind: null });
    lastEmittedFocusId = null;
  }
}

/** One line-of-sight ray from the eye/camera to the candidate against WORLD geometry. */
function isBlocked(entity: ClientEntity, player: PlayerRef): boolean {
  const ctx = getRapier();
  if (!ctx) return false;
  if (!entityPosition(entity, losTarget)) return false;

  if (viewpoint.active) losOrigin.set(viewpoint.px, viewpoint.py, viewpoint.pz);
  else losOrigin.set(player.position.x, player.position.y + EYE_HEIGHT, player.position.z);

  losDir.copy(losTarget).sub(losOrigin);
  const dist = losDir.length();
  if (dist < 1e-3) return false;
  losDir.multiplyScalar(1 / dist);

  try {
    if (!losRay) losRay = new ctx.rapier.Ray(losOrigin, losDir);
    losRay.origin.x = losOrigin.x;
    losRay.origin.y = losOrigin.y;
    losRay.origin.z = losOrigin.z;
    losRay.dir.x = losDir.x;
    losRay.dir.y = losDir.y;
    losRay.dir.z = losDir.z;
    const hit = ctx.world.castRay(
      losRay,
      dist - 0.15,
      true,
      undefined,
      LOS_QUERY_GROUPS,
      undefined,
      player.body ?? undefined,
    );
    return hit != null;
  } catch {
    // Never let an LOS edge case break focus.
    return false;
  }
}

function runFocus(dt: number): void {
  acc += dt;
  if (acc < FOCUS_INTERVAL) return;
  acc = 0;

  const player = getPlayerRef();
  if (!player) {
    if (getFocusedEntity()) clearFocus();
    return;
  }

  origin.set(player.position.x, player.position.y, player.position.z);

  let hasForward = false;
  if (viewpoint.active && viewpoint.hasForward) {
    forward.set(viewpoint.fx, viewpoint.fy, viewpoint.fz);
    hasForward = true;
  } else {
    const facing = player.entity?.movement?.facing;
    if (typeof facing === "number") {
      forward.set(-Math.sin(facing), 0, -Math.cos(facing));
      hasForward = true;
    }
  }

  const now = performance.now() / 1000;
  const store = useInteractionStore.getState();

  let best: ClientEntity | null = null;
  let bestScore = -Infinity;
  let bestId = "";
  let bestPrompt: PromptData | null = null;

  for (const entity of interactables.entities) {
    const cfg = entity.interact_;
    if (!cfg || cfg.disabled || entity.interact_disabled) {
      dropInRange(entity, store);
      continue;
    }
    if (!entityPosition(entity, toObj)) continue;

    toObj.sub(origin);
    const dist = toObj.length();
    const range = rangeFor(cfg.kind, cfg.range);
    if (dist > range + STALE_RANGE_SLOP) {
      dropInRange(entity, store);
      continue;
    }

    // In range — maintain hint tags.
    const id = resolveId(entity);
    if (!store.inRange.has(id)) store.addInRange(id);
    if (!entity.interact_inRange) world.addComponent(entity, "interact_inRange", true);

    const handler = getHandler(cfg.kind);
    if (!handler) continue;

    const prompt = handler.getPrompt(makeContext(entity, player, dist, "primary", now));
    if (!prompt) continue; // handler says hidden/disabled

    let align = 0;
    if (hasForward && dist > 1e-3) {
      align = (toObj.x * forward.x + toObj.y * forward.y + toObj.z * forward.z) / dist;
    }
    const score =
      (cfg.priority ?? 0) * SCORE_WEIGHTS.priority +
      align * SCORE_WEIGHTS.align -
      dist * SCORE_WEIGHTS.distance;

    if (score > bestScore) {
      bestScore = score;
      best = entity;
      bestId = id;
      bestPrompt = prompt;
    }
  }

  if (best && bestPrompt) {
    if (ENABLE_LOS && isBlocked(best, player)) {
      clearFocus();
      return;
    }
    commitFocus(best, bestId, bestPrompt);
  } else {
    clearFocus();
  }
}

/** Update-phase focus system (runs before dispatch). */
export const focusSystem: System<W> = {
  name: "interaction:focus",
  phase: "update",
  order: -10,
  fn: (_w, dt) => runFocus(dt),
};
