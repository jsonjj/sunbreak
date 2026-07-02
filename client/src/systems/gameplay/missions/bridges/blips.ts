// Blip bridge — the "add blips to the map blip store" deliverable.
//
// The shared map blip store is `useHudStore().blips: Blip[]` (kinds include "mission" and
// "waypoint"; the minimap/full map render these). We own only the `mission:` / `waypoint:`
// namespaces and MERGE with everyone else's blips so we never clobber player/enemy/vehicle blips.

import { useHudStore } from "@/stores/hud.store";
import type { Blip } from "@sunbreak/shared";
import { useMissionStore } from "../store";

const MISSION_PREFIX = "mission:";
const WAYPOINT_PREFIX = "waypoint:";

const isOurs = (id: string) => id.startsWith(MISSION_PREFIX) || id.startsWith(WAYPOINT_PREFIX);

let lastSignature = "";

function buildMissionBlips(): Blip[] {
  const { markers, status } = useMissionStore.getState();
  const out: Blip[] = [];

  // Start-trigger blips for missions currently available to accept.
  for (const [id, entry] of Object.entries(status)) {
    if (entry.status === "available" && entry.startPos) {
      out.push({
        id: `${MISSION_PREFIX}start:${id}`,
        x: entry.startPos[0],
        z: entry.startPos[2],
        kind: "mission",
        label: entry.title,
      });
    }
  }

  // Active objective markers + GPS waypoint.
  for (const m of markers) {
    const waypoint = m.kind === "waypoint" || m.waypoint === true;
    out.push({
      id: `${waypoint ? WAYPOINT_PREFIX : MISSION_PREFIX}${m.id}`,
      x: m.position[0],
      z: m.position[2],
      kind: waypoint ? "waypoint" : "mission",
      label: m.label,
    });
  }

  return out;
}

/** Called from the throttled finish-phase system. Cheap no-op when nothing changed. */
export function syncBlips(): void {
  const mine = buildMissionBlips();
  const signature = mine.map((b) => `${b.id}@${b.x.toFixed(1)},${b.z.toFixed(1)}:${b.label ?? ""}`).join("|");
  if (signature === lastSignature) return;
  lastSignature = signature;

  const hud = useHudStore.getState();
  const others = hud.blips.filter((b) => !isOurs(b.id));
  hud.patch({ blips: [...others, ...mine] });
}

/** Remove all mission-owned blips (used on teardown). */
export function clearBlips(): void {
  lastSignature = "";
  const hud = useHudStore.getState();
  const others = hud.blips.filter((b) => !isOurs(b.id));
  if (others.length !== hud.blips.length) hud.patch({ blips: others });
}
