# SUNBREAK

A **free, browser-based, open-world crime game** — a "slightly lesser GTA 6" — built on a
100% free, self-hostable web stack. Walk, (soon) drive, and explore the sun-soaked state of
**Verano** and its city **Santa Vista**. Runs locally on a modern Mac in Chrome.

> **The Cost Rule:** the *only* paid dependency ever permitted is **your own OpenAI API key**
> at runtime (server-proxied, used later for live NPC dialogue). It is **not** required to run
> the current build. Everything else is free and self-hostable.

---

## Current milestone — **v0: walk a textured block**

- React Three Fiber `<Canvas>` with ACES filmic tone mapping, sRGB, soft shadows, procedural sky.
- Rapier physics (`@react-three/rapier`) with a ground plane, a textured block, a ramp, and a curb.
- A **kinematic capsule character controller**: walk / run / sprint / jump, gravity, autostep,
  slope handling, ground snapping.
- A **collision-aware third-person follow camera** with pointer-lock mouse look.
- A unified **input manager** (WASD + mouse).
- miniplex ECS world + Zustand stores, with an FPS/perf overlay.

## Prerequisites

- **macOS + Chrome** (target platform)
- **Node.js 22 LTS or newer** ([nodejs.org](https://nodejs.org))
- **pnpm** via Corepack (no global install needed)
- **git**

## Quickstart

```bash
# 1. Enable pnpm (ships with Node via Corepack):
corepack enable

# 2. Install everything (client + server + shared):
pnpm install

# 3. (Optional, for later AI features) add your ONE key — the only cost in the project:
cp server/.env.example server/.env
#    → open server/.env and paste: OPENAI_API_KEY=sk-...
#    v0 runs fine WITHOUT a key.

# 4. Play. Boots the game client + a minimal API server together:
pnpm dev
#    → open http://localhost:5173 in Chrome. Stop with Ctrl-C.
```

Add `?debug` to the URL (`http://localhost:5173/?debug`) to show the physics collider wireframes
and the r3f-perf performance overlay.

## Controls (v0, on foot)

| Key | Action | | Key | Action |
| --- | --- | --- | --- | --- |
| `W A S D` | Move | | Mouse | Look (click canvas to capture) |
| `Shift` | Sprint | | `Alt` | Walk (slow) |
| `Space` | Jump | | `Esc` | Release mouse |
| `C` | Crouch | | | |

## Project structure

```
sunbreak/                 # pnpm workspace root
├─ client/                # @sunbreak/client — React 19 + R3F game (Vite)
│  └─ src/
│     ├─ render/          # <Canvas>, lighting, quality tiers
│     ├─ physics/         # <Physics> provider + collision layers
│     ├─ player/          # kinematic character controller
│     ├─ camera/          # third-person follow rig
│     ├─ input/           # keyboard + mouse (pointer-lock)
│     ├─ ecs/             # miniplex world, queries, client entity
│     ├─ game/            # scene, systems runner, factories
│     ├─ stores/          # Zustand stores (game/hud/ui/settings)
│     ├─ ui/              # DOM HUD overlay
│     └─ systems/         # STUB folders for Wave-2 subsystems
├─ server/                # @sunbreak/server — Express skeleton (OpenAI proxy / Colyseus / SQLite placeholders)
│  └─ src/
├─ shared/                # @sunbreak/shared — types, ECS components, protocol, constants (TS source, no build)
│  └─ src/
├─ assets/                # CC0 source assets + ATTRIBUTION.md
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
└─ package.json
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run client (Vite `:5173`) + server (`:8787`) concurrently |
| `pnpm dev:client` | Client only |
| `pnpm build` | Production build of the client |
| `pnpm typecheck` | Strict TypeScript check across all packages |

## Tech stack (locked, all free)

TypeScript · pnpm workspaces · Vite · React 19 · Three.js (r181) · React Three Fiber v9 ·
drei · @react-three/rapier (Rapier WASM) · miniplex ECS · Zustand · Express · (later) Colyseus,
better-sqlite3, OpenAI (server-proxied).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Blank screen | Check the browser console; ensure WebGL2 is enabled in Chrome. |
| Mouse won't look | Click the canvas once to capture the pointer (Esc releases it). |
| Port already in use | Stop the other process, or change `CLIENT_PORT` / `SERVER_PORT` in `shared/src/constants/net.ts`. |
| Wrong Node version | `nvm use` (respects `.nvmrc`) then reinstall. |

## Roadmap

- **v0** — walk a character around one textured block. ← *you are here*
- **v1** — small city + drivable car + enter/exit + HUD + local save.
- **v2** — pedestrians + traffic + combat + wanted/police.
- **v3** — missions + economy + AI NPC dialogue (OpenAI) + radio.
- **v4** — online multiplayer (Colyseus) + persistence + accounts.
- **v5** — polish, content, activities, optimization.

License: game code intended to be free to run. All art/audio assets are CC0 — see
[`assets/ATTRIBUTION.md`](assets/ATTRIBUTION.md).
