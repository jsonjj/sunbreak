// Handler registry + collider→id map.
//
// Two tiers so registration order across ~36 parallel subsystems never matters:
//   - `defaults`  — built-in handlers registered by THIS subsystem at boot.
//   - `handlers`  — authoritative overrides registered by any subsystem via `registerHandler`.
// `getHandler` always prefers an authoritative override, so e.g. the Vehicles subsystem can own
// `vehicle_enter` regardless of whether it imports before or after us.

import type { InteractionHandler, InteractionKind } from "./types";

const handlers = new Map<InteractionKind, InteractionHandler>();
const defaults = new Map<InteractionKind, InteractionHandler>();

/**
 * Register (or override) the handler for a verb kind. This is THE extension point other
 * subsystems use to add interactions. Returns an unregister fn.
 */
export function registerHandler<D>(handler: InteractionHandler<D>): () => void {
  // Method-position signatures are bivariant, so the specific-D handler is a valid unknown-D one.
  const stored = handler as unknown as InteractionHandler;
  handlers.set(handler.kind, stored);
  return () => {
    if (handlers.get(handler.kind) === stored) handlers.delete(handler.kind);
  };
}

/** Internal: register a built-in fallback handler (does not clobber authoritative overrides). */
export function registerDefaultHandler(handler: InteractionHandler): void {
  defaults.set(handler.kind, handler);
}

/** Resolve the effective handler for a kind (override first, then built-in default). */
export function getHandler(kind: InteractionKind): InteractionHandler | undefined {
  return handlers.get(kind) ?? defaults.get(kind);
}

export function hasHandler(kind: InteractionKind): boolean {
  return handlers.has(kind) || defaults.has(kind);
}

// ── collider handle → interactable id (populated by sensor triggers, read by aim picks) ────────
const colliderToId = new Map<number, string>();

export function registerCollider(handle: number, id: string): void {
  colliderToId.set(handle, id);
}

export function unregisterCollider(handle: number): void {
  colliderToId.delete(handle);
}

/** Map a Rapier collider handle (from an aim raycast) back to the interactable id. */
export function getIdByCollider(handle: number): string | undefined {
  return colliderToId.get(handle);
}
