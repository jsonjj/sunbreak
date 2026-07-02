// ─────────────────────────────────────────────────────────────────────────────
// WAVE-2 AUTO-REGISTRATION — CENTRAL WIRING. DO NOT EDIT AS A SUBSYSTEM AGENT.
// ─────────────────────────────────────────────────────────────────────────────
// This file eagerly imports the ROOT `index.ts(x)` of every client subsystem so that
// each one self-registers on import (by calling `registerModule` / `registerSystem`
// from `client/src/game/registry.ts` at module top level). It is imported exactly once
// from the app entry (`client/src/main.tsx`), before React renders.
//
// Discovery contract — a subsystem's registration entry is EXACTLY:
//     client/src/systems/<domain>/<subsystem>/index.ts   (or .tsx)
// The `*/*` (not `**`) depth is deliberate: only each subsystem's ROOT index is auto-
// imported. Any other files a subsystem creates inside its own folder are pulled in by
// that root index, never by this loader — so nested files can be named anything (and a
// nested `index.ts` will NOT be double-registered).
//
// Adding a subsystem = create its folder + `index.ts` and register there. No edit here.
const modules = import.meta.glob(
  ["../systems/*/*/index.ts", "../systems/*/*/index.tsx"],
  { eager: true },
);

/** Root index modules discovered by the glob (keyed by path). Exposed for debug/logging. */
export const subsystemModules = modules;

/** How many subsystem entrypoints were auto-loaded (handy for a boot-time sanity check). */
export const loadedSubsystemCount = Object.keys(modules).length;
