# SUNBREAK — WAVE-2 AGENT PROTOCOL (read fully before writing code)

You implement **one** subsystem for SUNBREAK (free browser GTA-like; pnpm monorepo `client`/`server`/`shared`). ~36 agents run in parallel right now. Obey this exactly. **Keep it free. Never break v0.**

## (a) File ownership — own ONLY your folder
- You own exactly one folder and everything in it:
  - client → `client/src/systems/<domain>/<subsystem>/`
  - server → `server/src/<domain>/<subsystem>/`
- NEVER create/edit/move/delete anything outside your folder. Never touch: `shared/**`, any `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc`, `client/vite.config.ts`, any `tsconfig*.json`, `client/src/main.tsx`, `client/src/App.tsx`, `client/src/game/registry.ts`, `client/src/game/systems-loader.ts`, `client/src/ecs/**`, `client/src/render/**` (v0), `client/src/player/**`, `client/src/camera/**`, `client/src/input/**`, `server/src/index.ts`, `server/src/env.ts`, `server/src/kernel/**`, or ANY other subsystem's folder.
- NEVER run `pnpm add` / change dependencies — everything is pre-installed (see (d)). If something's truly missing, STOP and note it in your report.
- Extend shared data only via declaration merging from your own file (see (c)).

## (b) Self-register from your `index.ts`
Your code runs only when your `index.ts` calls a register fn at module top level. Loaders import your `index.ts` automatically — no central edits.

Client (`client/src/systems/<domain>/<subsystem>/index.ts`):
```ts
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
type W = typeof world;
export const mod: SubsystemModule<W> = {
  id: "domain/subsystem",
  systems: [{ name: "tick", phase: "update", order: 0, fn: (w, dt) => { /* mutate ECS */ } }],
  init() { /* optional; return cleanup */ },
};
registerModule(mod); // required side effect
```
Phases each frame: `input → update → render → finish`. Gameplay in `update`, per-frame view sync in `render`, HUD mirror in `finish`, device sampling in `input`. `prePhysics`/`postPhysics` exist but are NOT yet driven — use Rapier `useBeforePhysicsStep`/`useAfterPhysicsStep` in your own R3F component if you need physics-step timing.

Server (`server/src/<domain>/<subsystem>/index.ts`):
```ts
import type { SubsystemModule } from "@sunbreak/shared";
import { registerBoot, registerModule } from "../../kernel/registry";
export const mod: SubsystemModule = { id: "domain/subsystem" };
registerModule(mod);
registerBoot(({ app, httpServer, env }) => {
  app.get("/api/domain/thing", (_req, res) => res.json({ ok: true }));
});
```

## (c) Extend the ECS `Entity` from YOUR file (prefix convention)
Augment the shared `SimComponents` interface in a file inside your folder:
```ts
import type { Vec3 } from "@sunbreak/shared"; // keep a real import so this stays a MODULE
declare module "@sunbreak/shared" {
  interface SimComponents {
    combat_ammo?: number;   // ALWAYS optional (?) or a presence tag (: true)
    combat_reloading?: true;
  }
}
```
- PREFIX every field with your subsystem key (`veh_`, `combat_`, `ped_`, `traffic_`, `wanted_`, `mission_`, `econ_`, `radio_`, `ai_`, `hud_`, `light_`, `city_`, …) to avoid collisions.
- The augmenting file MUST contain a top-level `import`/`export` or it silently replaces the module and breaks shared types.
- Type entities as `ClientEntity` (client: `@/ecs/clientEntity`) or `SimEntity` (server). Query via miniplex, e.g. `world.with("combat_ammo")`. Sim components are serializable POJOs; live THREE/Rapier refs are client-only view components already on `ClientEntity` (`three`, `rigidBody`, `mixer`, `interpolation`) — REUSE those to render visuals through the ECS↔R3F bridge (don't hand-mount into App/Scene).

## (d) Pre-installed deps (do NOT add any)
Client: react@19, react-dom@19, three@^0.181, @react-three/fiber@^9, @react-three/drei@^10, @react-three/rapier@^2.1, @react-three/postprocessing, postprocessing, miniplex@^2, miniplex-react, zustand@^5, maath, r3f-perf, detect-gpu, howler (+@types), three.quarks, recast-navigation + @recast-navigation/three, colyseus.js, leva, zundo, mitt, motion, zod.
Server: express, cors, helmet, express-rate-limit, dotenv, zod, openai, @colyseus/core, @colyseus/ws-transport, @colyseus/schema, jsonwebtoken (+@types), bcryptjs (+@types), lru-cache, better-sqlite3.

## (e) Unavailable / fallbacks
- The `colyseus` meta-package is NOT installed (blocked git dep). Server uses `@colyseus/core` + `@colyseus/ws-transport` + `@colyseus/schema`; client uses `colyseus.js`.
- `better-sqlite3` works on Node 26 — use it. Fallback if ever needed: `sql.js` / `node:sqlite`. Never a paid DB.

## (f) Typecheck & DO-NOT during the wave
- DO NOT run a full/package typecheck — ~36 agents are editing `@sunbreak/client` concurrently, so it will show unrelated errors from siblings' in-flight files. Write correct, well-typed code in YOUR folder; the integrator runs the final typecheck and fixes seams.
- DO NOT `git commit` / `git push`. The integrator commits.
- If types fail because of YOUR code, fix your folder only — never edit tsconfig/vite/shared to force a pass.
