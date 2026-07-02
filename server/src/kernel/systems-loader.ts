// ─────────────────────────────────────────────────────────────────────────────
// SERVER AUTO-REGISTRATION — CENTRAL WIRING. DO NOT EDIT AS A SUBSYSTEM AGENT.
// ─────────────────────────────────────────────────────────────────────────────
// The server analogue of client/src/game/systems-loader.ts. There is no bundler here
// (the server runs under `tsx`), so instead of Vite's import.meta.glob we scan the source
// tree at boot and dynamically import each subsystem's ROOT index module. Importing it runs
// that subsystem's top-level self-registration (registerBoot / registerModule).
//
// Discovery contract — a subsystem's registration entry is EXACTLY:
//     server/src/<domain>/<subsystem>/index.ts
// i.e. exactly two levels below server/src. The `kernel/` folder (this wiring) is skipped,
// as are the top-level infra files (index.ts, env.ts). Deeper nested index files a subsystem
// creates in its own folder are NOT auto-imported — its root index pulls them in.
import { readdirSync } from "node:fs";
import { join, sep, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcRoot = dirname(dirname(fileURLToPath(import.meta.url))); // server/src

/** Reserved top-level folders that are NOT subsystem domains. */
const RESERVED = new Set(["kernel"]);

function findSubsystemEntries(): string[] {
  let all: string[];
  try {
    all = readdirSync(srcRoot, { recursive: true }) as string[];
  } catch {
    return [];
  }
  return all
    .filter((rel) => {
      const parts = rel.split(sep);
      // exactly <domain>/<subsystem>/index.ts, and not under a reserved folder
      return (
        parts.length === 3 &&
        parts[2] === "index.ts" &&
        parts[0] !== undefined &&
        !RESERVED.has(parts[0])
      );
    })
    .sort(); // deterministic load order
}

/**
 * Dynamically import every server subsystem so it self-registers on import.
 * Called ONCE from server/src/index.ts before the boot hooks are flushed.
 * @returns the list of imported subsystem entry paths (relative to server/src).
 */
export async function loadServerSubsystems(): Promise<string[]> {
  const entries = findSubsystemEntries();
  for (const rel of entries) {
    await import(pathToFileURL(join(srcRoot, rel)).href);
  }
  return entries;
}
