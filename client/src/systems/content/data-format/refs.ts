// content/data-format — cross-file referential integrity.
//
// Second validation pass (after per-doc schema validation): build id sets across everything in
// the registry and verify cross-references resolve. Non-throwing by design — returns a list of
// issues so it NEVER blocks a sibling; callers decide whether to warn (dev) or fail (CI).
import { allMaps, allMissions, allNpcs, allVehicles, allWeapons } from "./registry";

export type RefLevel = "error" | "warn";

export interface RefIssue {
  level: RefLevel;
  /** Where the dangling ref lives, e.g. `mission:mission_intro.giver`. */
  from: string;
  /** The id that failed to resolve. */
  ref: string;
  message: string;
}

/** Run the cross-reference pass over all registered content. Returns dangling refs (may be empty). */
export const checkReferentialIntegrity = (): RefIssue[] => {
  const issues: RefIssue[] = [];

  const vehicleIds = new Set(allVehicles().map((v) => v.id));
  const weaponIds = new Set(allWeapons().map((w) => w.id));
  const npcIds = new Set(allNpcs().map((n) => n.id));
  const missionIds = new Set(allMissions().map((m) => m.id));
  const districtIds = new Set<string>();
  for (const m of allMaps()) for (const d of m.districts) districtIds.add(d.id);

  const need = (ok: boolean, level: RefLevel, from: string, ref: string, kind: string): void => {
    if (!ok) issues.push({ level, from, ref, message: `${kind} "${ref}" not found` });
  };

  for (const m of allMissions()) {
    if (m.giver) need(npcIds.has(m.giver), "error", `mission:${m.id}.giver`, m.giver, "npc");
    for (const pre of m.prerequisites.missionIds)
      need(missionIds.has(pre), "error", `mission:${m.id}.prerequisites`, pre, "mission");
    const nexts = m.next == null ? [] : Array.isArray(m.next) ? m.next : [m.next];
    for (const n of nexts) need(missionIds.has(n), "error", `mission:${m.id}.next`, n, "mission");
    if (m.districtId)
      need(districtIds.has(m.districtId), "warn", `mission:${m.id}.districtId`, m.districtId, "district");
  }

  for (const n of allNpcs()) {
    const wid = n.loadout.weaponId;
    if (wid) need(weaponIds.has(wid), "error", `npc:${n.id}.loadout.weaponId`, wid, "weapon");
    for (const d of n.spawn.districts)
      need(districtIds.has(d), "warn", `npc:${n.id}.spawn.districts`, d, "district");
  }

  for (const v of allVehicles())
    for (const d of v.spawnDistricts)
      need(districtIds.has(d), "warn", `vehicle:${v.id}.spawnDistricts`, d, "district");

  for (const map of allMaps()) {
    for (const poi of map.pois) {
      const { missionId, npcId } = poi.links;
      if (missionId)
        need(
          missionIds.has(missionId),
          "error",
          `map:${map.id}.pois.${poi.id}.links.missionId`,
          missionId,
          "mission",
        );
      if (npcId)
        need(npcIds.has(npcId), "warn", `map:${map.id}.pois.${poi.id}.links.npcId`, npcId, "npc");
    }
    for (const s of map.spawns)
      if (s.districtId)
        need(
          districtIds.has(s.districtId),
          "warn",
          `map:${map.id}.spawns.${s.id}.districtId`,
          s.districtId,
          "district",
        );
  }

  return issues;
};

/** Only the blocking (`error`-level) ref issues. */
export const refIntegrityErrors = (): RefIssue[] =>
  checkReferentialIntegrity().filter((i) => i.level === "error");
