// Public contracts for the generic interaction subsystem.
//
// Everything an interactable declares lives in ONE serializable ECS component (`interact_`,
// see `interaction.components.ts`). Behaviour lives in client-only *handlers* keyed by `kind`
// (see `registry.ts`). This split keeps the on-entity data a plain POJO (server-safe, v4) while
// the focus / prompt / dispatch loop stays fully data-driven.

import type { RapierContext, RapierRigidBody } from "@react-three/rapier";
import type { World } from "miniplex";
import type { Vec3 } from "@sunbreak/shared";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { InteractionEvents } from "./events";

/** Live Rapier handles are only reachable inside R3F; we derive their types from the hook so we
 *  never take a hard dependency on `@dimforge/rapier3d-compat` (a transitive-only package). */
export type { RapierContext, RapierRigidBody };
export type RapierWorld = RapierContext["world"];
export type RapierAPI = RapierContext["rapier"];

/** Built-in verbs, open to extension (`registerHandler` with any string kind). */
export type InteractionKind =
  | "vehicle_enter"
  | "item_pickup"
  | "npc_talk"
  | "door"
  | "shop_buy"
  | (string & {});

/** Which key slot fired the dispatch. */
export type InteractionActionSlot = "primary" | "secondary";

/**
 * The on-entity descriptor — the value of the `interact_` component. Add this to any entity to
 * make it interactable. Must stay a serializable POJO (no functions / class instances).
 */
export interface InteractVerbConfig<D = unknown> {
  /** Which handler resolves the prompt + action. */
  kind: InteractionKind;
  /** Verb shown in the prompt, e.g. "Enter", "Pick up", "Talk". */
  verb: string;
  /** Key glyph override; defaults to the kind's primary key ("E"). */
  key?: string;
  /** Contextual label, e.g. "Val's Taxi". */
  label?: string;
  /** Detection radius (m). Falls back to the kind default when omitted. */
  range?: number;
  /** Focus tie-break weight; higher wins when several are in range. Default 0. */
  priority?: number;
  /** Seconds the key must be held. Omit / 0 = press-to-interact. */
  hold?: number;
  /** Marks this as an aim-precise pick (crosshair raycast, handled by the rig). */
  requiresAim?: true;
  /** Temporarily hide/disable without removing the component. */
  disabled?: true;
  /** Stable id for the HUD / markers. Falls back to `net:<netId>` then an auto id. */
  id?: string;
  /** Optional secondary verb (shown as the "F" action). */
  secondaryVerb?: string;
  secondaryKey?: string;
  /** Kind-specific payload consumed by the handler (vehicleNetId, itemId, open, price…). */
  data?: D;
}

/** What the HUD renders for the focused interactable. `null` from a handler = hidden/disabled. */
export interface PromptData {
  key: string;
  verb: string;
  label?: string;
  /** Seconds; presence turns the prompt into a hold action (HUD shows a progress ring). */
  hold?: number;
  secondary?: { key: string; verb: string };
}

/** A lightweight, reused view of the local player passed to handlers. */
export interface PlayerRef {
  entity: ClientEntity | null;
  netId: number | null;
  /** Live-ish world position (rigidbody translation, else transform). Reused — do not retain. */
  position: Vec3;
  body: RapierRigidBody | null;
}

/** Everything a handler needs to decide a prompt or run an action. */
export interface InteractionContext<D = unknown> {
  /** The interactable entity itself. */
  entity: ClientEntity;
  /** Convenience alias of `entity.interact_`. */
  config: InteractVerbConfig<D>;
  player: PlayerRef;
  /** Distance (m) from the player to this entity at evaluation time. */
  distance: number;
  /** Which slot is dispatching (only meaningful in `onInteract`). */
  action: InteractionActionSlot;
  /** Seconds (performance.now()/1000). */
  now: number;
  /** The client ECS world (mutate seat occupancy, despawn items, etc.). */
  world: World<ClientEntity>;
  /** Live Rapier context — only present once `<InteractionRig>` is mounted. */
  rapier: RapierContext | null;
  /** Typed event bus so other subsystems can react without importing this folder's internals. */
  events: InteractionEvents;
}

/**
 * A verb implementation. Register your own with `registerHandler` to override a built-in or add a
 * new kind — this is the primary extension point for other subsystems.
 */
export interface InteractionHandler<D = unknown> {
  kind: InteractionKind;
  defaultRange?: number;
  defaultKey?: string;
  requiresAim?: boolean;
  /** Return the prompt to show, or `null` to hide (e.g. vehicle full, can't afford). */
  getPrompt(ctx: InteractionContext<D>): PromptData | null;
  /** Perform the action. May be async (network request in v4). */
  onInteract(ctx: InteractionContext<D>): void | Promise<void>;
}
