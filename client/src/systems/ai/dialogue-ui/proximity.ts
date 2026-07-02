// Proximity + interact driver — the "Press E to talk" flow, as a registered ECS system
// (runs each frame inside <SystemsRunner>, so it has a valid frame tick without hand-
// mounting into the scene). It:
//   • throttles a scan (~200ms) for the nearest Conversable in range + within a forward
//     cone (camera yaw), reading player pose straight off the ECS,
//   • publishes `nearbyNpc` to our store AND the shared UI `contextPrompt` slice (the
//     HUD's "Press E" prompt; the overlay also renders a built-in fallback prompt),
//   • edge-detects the shared Interact action (E / gamepad) → opens the conversation.
//
// Transient by design: never allocates per frame, only writes to the store on change.

import { InputAction, PedArchetype, type System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { input } from "@/input/InputManager";
import { useUiStore } from "@/stores/ui.store";
import { useGameStore } from "@/stores/game.store";
import { CLOSE_RANGE, FOV_DOT, INTERACT_RANGE, PROXIMITY_POLL_MS } from "./constants";
import { useDialogueStore, type NearbyConversable } from "./store";

type W = typeof world;

const POLL_S = PROXIMITY_POLL_MS / 1000;

// Reused module-level queries (create once; iterate .entities each frame).
const convQuery = world.with("dlg_conversable", "transform");
const pedQuery = world.with("isPed", "transform");
const playerQuery = world.with("isPlayer", "transform");

let pollAcc = 0;
let prevInteract = false;

function labelForArchetype(a: PedArchetype): string {
  switch (a) {
    case PedArchetype.Business:
      return "Businessperson";
    case PedArchetype.Tourist:
      return "Tourist";
    case PedArchetype.Gangster:
      return "Stranger";
    case PedArchetype.Police:
      return "Officer";
    case PedArchetype.Civilian:
    default:
      return "Local";
  }
}

/** Turn an entity into a talk target: prefer its explicit Conversable, else derive from ped. */
function toNearby(e: ClientEntity): NearbyConversable | null {
  if (e.dlg_conversable) {
    return { ...e.dlg_conversable, netId: e.netId, distance: 0 };
  }
  if (e.isPed) {
    const arch = e.ped?.archetype ?? PedArchetype.Civilian;
    const netId = e.netId ?? 0;
    return {
      npcId: `ped:${netId}`,
      displayName: labelForArchetype(arch),
      personaId: `archetype:${arch}`,
      netId,
      distance: 0,
    };
  }
  return null;
}

function findNearest(player: ClientEntity): NearbyConversable | null {
  const pt = player.transform;
  if (!pt) return null;
  const yaw = input.yaw;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);

  let best: NearbyConversable | null = null;
  let bestDist = Infinity;

  const consider = (e: ClientEntity): void => {
    if (!e.transform) return;
    const dx = e.transform.position.x - pt.position.x;
    const dz = e.transform.position.z - pt.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > INTERACT_RANGE || dist >= bestDist) return;
    if (dist > CLOSE_RANGE) {
      const len = dist || 1;
      const dot = (dx / len) * fx + (dz / len) * fz;
      if (dot < FOV_DOT) return; // not roughly facing them
    }
    const meta = toNearby(e);
    if (!meta) return;
    meta.distance = dist;
    best = meta;
    bestDist = dist;
  };

  for (const e of convQuery.entities) consider(e);
  for (const e of pedQuery.entities) if (!e.dlg_conversable) consider(e);
  return best;
}

export const proximitySystem: System<W> = {
  name: "dlg:proximity",
  phase: "update",
  order: 50,
  fn: (_w, dt) => {
    const store = useDialogueStore.getState();

    // Edge-detect the shared Interact action every frame (independent of the scan throttle).
    const interactDown = input.isActionDown(InputAction.Interact);
    const justPressed = interactDown && !prevInteract;
    prevInteract = interactDown;

    // Don't scan or re-open while a conversation is already up.
    if (store.status !== "idle") {
      pollAcc = 0;
      return;
    }

    const player = playerQuery.entities[0];
    if (!player?.transform) {
      if (store.nearby) {
        store.setNearby(null);
        useUiStore.getState().setContextPrompt(null);
      }
      pollAcc = 0;
      return;
    }

    pollAcc += dt;
    if (pollAcc >= POLL_S) {
      pollAcc = 0;
      const nearest = findNearest(player);
      const cur = store.nearby;
      if ((nearest?.npcId ?? null) !== (cur?.npcId ?? null)) {
        store.setNearby(nearest);
        useUiStore
          .getState()
          .setContextPrompt(nearest ? `Press E · talk to ${nearest.displayName}` : null);
      } else if (nearest && cur) {
        cur.distance = nearest.distance; // keep fresh without prompt re-render churn
      }
    }

    if (justPressed) {
      const near = store.nearby;
      if (near && useGameStore.getState().phase === "playing") {
        useUiStore.getState().setContextPrompt(null);
        store.open({ npcId: near.npcId, personaId: near.personaId, displayName: near.displayName });
      }
    }
  },
};
