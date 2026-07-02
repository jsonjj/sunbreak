// ─────────────────────────────────────────────────────────────────────────────
// SERVER KERNEL — CENTRAL WIRING. DO NOT EDIT AS A SUBSYSTEM AGENT.
// ─────────────────────────────────────────────────────────────────────────────
// The server analogue of client/src/game/registry.ts. Server subsystems (under
// server/src/<domain>/<subsystem>/) self-register here on import:
//   • registerModule / registerSystem — future authoritative-sim systems (v4).
//   • registerBoot(hook)              — mount Express routes/middleware or attach
//                                        Colyseus/WebSocket to the shared HTTP server,
//                                        WITHOUT ever editing server/src/index.ts.
import { SystemRegistry } from "@sunbreak/shared";
import type { Express } from "express";
import type { Server as HttpServer } from "node:http";
import type { env as serverEnv } from "../env";

/** The server system registry (authoritative-sim systems land here in v4). */
export const registry = new SystemRegistry();

/** Re-exported so subsystems register systems/modules without importing the class. */
export const registerSystem = registry.register.bind(registry);
export const registerModule = registry.registerModule.bind(registry);

/** Everything a subsystem needs at boot to wire itself into the running server. */
export interface ServerBootContext {
  /** The Express app — mount REST routes and middleware here. */
  readonly app: Express;
  /** The underlying HTTP server — attach Colyseus / raw WebSocket transports here (v4). */
  readonly httpServer: HttpServer;
  /** Validated, read-only server environment. */
  readonly env: typeof serverEnv;
}

/** A one-time boot hook; may return a cleanup function (called on shutdown, if wired). */
export type BootHook = (ctx: ServerBootContext) => void | (() => void);

const bootHooks: BootHook[] = [];

/** Register a boot hook. Called by subsystems at import time; flushed by index.ts. */
export function registerBoot(hook: BootHook): void {
  bootHooks.push(hook);
}

/** Run every registered boot hook in registration order. Called ONCE by index.ts. */
export function applyBoot(ctx: ServerBootContext): Array<() => void> {
  const cleanups: Array<() => void> = [];
  for (const hook of bootHooks) {
    const dispose = hook(ctx);
    if (typeof dispose === "function") cleanups.push(dispose);
  }
  return cleanups;
}
