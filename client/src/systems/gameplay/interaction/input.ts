// Input & dispatch — reads the shared InputManager each frame (60 Hz), handles press vs hold,
// enforces a per-entity cooldown, and runs the focused handler's `onInteract`. Focus itself is
// decided by `focus.ts`; this system only acts on the current focus.

import * as THREE from "three";
import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import { input } from "@/input/InputManager";
import type { InteractionActionSlot } from "./types";
import { getHandler } from "./registry";
import { useInteractionStore } from "./store";
import { interactionEvents } from "./events";
import { entityPosition, getFocusedEntity, getPlayerRef, resolveId } from "./runtime";
import { makeContext } from "./context";
import {
  INTERACT_COOLDOWN,
  PRIMARY_ACTION,
  rangeFor,
  REQUIRE_POINTER_LOCK,
  SECONDARY_ACTION,
  STALE_RANGE_SLOP,
} from "./constants";

type W = typeof world;

const cooldowns = new Map<string, number>();
const scratch = new THREE.Vector3();

let prevPrimary = false;
let prevSecondary = false;
let holdElapsed = 0;
let holdFired = false;

function dispatch(action: InteractionActionSlot): void {
  const entity = getFocusedEntity();
  if (!entity || !entity.interact_) return;
  const cfg = entity.interact_;
  const handler = getHandler(cfg.kind);
  if (!handler) return;
  const player = getPlayerRef();
  if (!player) return;

  const now = performance.now() / 1000;
  const id = resolveId(entity);
  if (now < (cooldowns.get(id) ?? 0)) return;

  // Re-validate distance so we never act on something that slipped out of range or despawned.
  if (!entityPosition(entity, scratch)) return;
  scratch.x -= player.position.x;
  scratch.y -= player.position.y;
  scratch.z -= player.position.z;
  const dist = scratch.length();
  if (dist > rangeFor(cfg.kind, cfg.range) + STALE_RANGE_SLOP) return;

  const ctx = makeContext(entity, player, dist, action, now);
  const prompt = handler.getPrompt(ctx);
  if (!prompt) return;
  if (action === "secondary" && !prompt.secondary) return;

  cooldowns.set(id, now + INTERACT_COOLDOWN);
  interactionEvents.emit("interact", { id, kind: cfg.kind, entity, action });
  try {
    void handler.onInteract(ctx);
  } catch (err) {
    console.error("[interaction] handler threw for", cfg.kind, err);
  }
}

function runInput(dt: number): void {
  const store = useInteractionStore.getState();
  const usable = REQUIRE_POINTER_LOCK ? input.locked : true;
  const primary = usable && input.isActionDown(PRIMARY_ACTION);
  const secondary = usable && input.isActionDown(SECONDARY_ACTION);
  const entity = getFocusedEntity();
  const prompt = store.prompt;

  // Nothing actionable — reset hold state, and swallow the edge so re-focusing a held key
  // doesn't instantly fire.
  if (!usable || !entity || !prompt) {
    if (store.holdProgress !== 0) store.setHold(0);
    holdElapsed = 0;
    holdFired = false;
    prevPrimary = primary;
    prevSecondary = secondary;
    return;
  }

  const hold = prompt.hold ?? 0;
  if (hold > 0) {
    if (primary) {
      holdElapsed += dt;
      const progress = Math.min(1, holdElapsed / hold);
      store.setHold(progress);
      if (progress >= 1 && !holdFired) {
        holdFired = true;
        dispatch("primary");
      }
    } else {
      if (store.holdProgress !== 0) store.setHold(0);
      holdElapsed = 0;
      holdFired = false;
    }
  } else if (primary && !prevPrimary) {
    dispatch("primary");
  }

  if (secondary && !prevSecondary && prompt.secondary) dispatch("secondary");

  prevPrimary = primary;
  prevSecondary = secondary;
}

/** Update-phase dispatch system (runs after focus). */
export const dispatchSystem: System<W> = {
  name: "interaction:input",
  phase: "update",
  order: 10,
  fn: (_w, dt) => runInput(dt),
};
