// Dev console command registry. `registerCommand` is a public extension point: any subsystem can
// add its own commands. `execute(line)` parses a line and runs the matching command.

import { cheats } from "../cheats/cheats";
import { useDebugStore } from "../store/debugStore";
import { useTuningStore } from "../store/tuningStore";
import { threeRefs } from "./context";

export interface DebugCommand {
  name: string;
  help: string;
  run: (args: string[]) => string | void;
}

const registry = new Map<string, DebugCommand>();

/** Register (or replace) a console command. Returns an unregister fn. */
export function registerCommand(cmd: DebugCommand): () => void {
  registry.set(cmd.name, cmd);
  return () => {
    if (registry.get(cmd.name) === cmd) registry.delete(cmd.name);
  };
}

export function commandNames(): string[] {
  return [...registry.keys()].sort();
}

/** Parse and run a single console line. Always returns a string for display. */
export function execute(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  const name = parts[0];
  if (!name) return "";
  const cmd = registry.get(name);
  if (!cmd) return `unknown command: ${name} (try 'help')`;
  try {
    return cmd.run(parts.slice(1)) ?? "";
  } catch (err) {
    return `error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function parseOnOff(arg: string | undefined): boolean | undefined {
  if (arg === "on" || arg === "1" || arg === "true") return true;
  if (arg === "off" || arg === "0" || arg === "false") return false;
  return undefined;
}

// --- built-in commands ------------------------------------------------------------------
const BUILTINS: DebugCommand[] = [
  {
    name: "help",
    help: "list all commands",
    run: () =>
      [...registry.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => `${c.name.padEnd(9)} ${c.help}`)
        .join("\n"),
  },
  { name: "clear", help: "clear the console output", run: () => "" },
  { name: "tp", help: "tp <x y z> | tp <waypoint>", run: (a) => cheats.teleport(a) },
  {
    name: "setwp",
    help: "setwp <name> — save current position",
    run: (a) => {
      const name = a[0];
      if (!name) return "usage: setwp <name>";
      const pos = cheats.setWaypoint(name);
      return pos ? `saved '${name}'` : "setwp: no player position yet";
    },
  },
  { name: "spawn", help: "spawn <car|ped|prop>", run: (a) => cheats.spawn(a[0]) },
  { name: "kill", help: "remove all debug-spawned entities", run: () => `removed ${cheats.killDbgSpawned()}` },
  {
    name: "god",
    help: "god [on|off] — toggle invulnerability",
    run: (a) => `god ${cheats.setGod(parseOnOff(a[0])) ? "on" : "off"}`,
  },
  { name: "heal", help: "restore full health", run: () => (cheats.heal() ? "healed" : "heal: no player") },
  {
    name: "noclip",
    help: "noclip [on|off] — toggle (marker)",
    run: (a) => `noclip ${cheats.setNoclip(parseOnOff(a[0])) ? "on" : "off"}`,
  },
  {
    name: "sel",
    help: "sel <id> — select entity in inspector",
    run: (a) => {
      const id = Number(a[0]);
      if (!Number.isFinite(id)) return "usage: sel <id>";
      useDebugStore.getState().select(id);
      useDebugStore.getState().set({ inspector: true });
      return `selected #${id}`;
    },
  },
  {
    name: "time",
    help: "time <0-24> — set time of day",
    run: (a) => {
      const h = Number(a[0]);
      if (!Number.isFinite(h)) return "usage: time <0-24>";
      const clamped = Math.max(0, Math.min(24, h));
      useTuningStore.getState().set("world.timeOfDay", clamped);
      return `time = ${clamped}`;
    },
  },
  {
    name: "slowmo",
    help: "slowmo <scale> — 1 = normal",
    run: (a) => {
      const s = Number(a[0]);
      if (!Number.isFinite(s)) return "usage: slowmo <scale>";
      useDebugStore.getState().set({ slowmo: Math.max(0, s) });
      return `slowmo = ${s} (gameplay systems opt-in)`;
    },
  },
  {
    name: "phys",
    help: "toggle physics collider wireframes",
    run: () => {
      useDebugStore.getState().toggle("physicsDebug");
      return `physics debug ${useDebugStore.getState().physicsDebug ? "on" : "off"}`;
    },
  },
  {
    name: "overlay",
    help: "overlay <off|minimal|full>",
    run: (a) => {
      const m = a[0];
      if (m !== "off" && m !== "minimal" && m !== "full") return "usage: overlay <off|minimal|full>";
      useDebugStore.getState().setOverlay(m);
      return `overlay = ${m}`;
    },
  },
  {
    name: "perf",
    help: "print current perf metrics",
    run: () => {
      const m = useDebugStore.getState().metrics;
      return (
        `fps ${m.fps.toFixed(0)}  ms ${m.ms.toFixed(2)}  calls ${m.calls}  tris ${m.triangles}` +
        `  geo ${m.geometries}  tex ${m.textures}  prog ${m.programs}` +
        (m.heapMB != null ? `  heap ${m.heapMB}MB` : "")
      );
    },
  },
  {
    name: "screenshot",
    help: "download a PNG of the canvas",
    run: () => {
      const gl = threeRefs.gl;
      if (!gl) return "screenshot: renderer not ready";
      try {
        const url = gl.domElement.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = `sunbreak-${Date.now()}.png`;
        a.click();
        return "screenshot saved";
      } catch (err) {
        return `screenshot failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  },
];

let installed = false;
/** Idempotently register the built-in commands. Safe to call more than once. */
export function registerBuiltinCommands(): void {
  if (installed) return;
  installed = true;
  for (const cmd of BUILTINS) registry.set(cmd.name, cmd);
}

// Register on import so `execute()` works as soon as this module is pulled in.
registerBuiltinCommands();
