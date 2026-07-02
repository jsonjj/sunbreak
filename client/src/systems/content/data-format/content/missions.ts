// content/data-format — seed missions.
//
// A short intro chain so the Missions runtime has data day one. `giver` → seed NPCs,
// `prerequisites`/`next` → each other, and the map POI links back to `mission_intro`. Typed with
// `satisfies MissionInput[]`; validated + registered in `registerSeedContent()`.
import type { MissionInput } from "../schemas";

export const SEED_MISSIONS = [
  {
    id: "mission_intro",
    name: "First Light",
    archetype: "solo",
    giver: "npc_mac",
    districtId: "district_costa-dorada",
    startTrigger: { type: "onFoot", pos: [12, 0, -8], radius: 3 },
    objectives: [
      { id: "obj_goto-garage", type: "goto", label: "Meet Mac at the garage", pos: [14, 0, -10], radius: 4 },
      { id: "obj_clear", type: "eliminate", label: "Clear the block", count: 3, optional: false },
      { id: "obj_escape", type: "escape", label: "Lose the heat", optional: true, timeLimit: 120 },
    ],
    medals: { bronze: { time: 240 }, silver: { time: 150 }, gold: { time: 90, noDamage: true } },
    rewards: { cash: 500, xp: 100, unlocks: ["veh_doyle-muscle"] },
    checkpoints: [[14, 0, -10]],
    failConditions: ["player_death", "giver_death"],
    dialogueRefs: ["persona_mac"],
    next: "mission_first-job",
  },
  {
    id: "mission_first-job",
    name: "Sunrise Run",
    archetype: "duo",
    giver: "npc_cami",
    districtId: "district_costa-dorada",
    prerequisites: { missionIds: ["mission_intro"], storyFlags: ["intro_done"] },
    objectives: [
      { id: "obj_drive", type: "drive", label: "Grab the GT", targetId: "veh_reyes-sport" },
      { id: "obj_deliver", type: "deliver", label: "Drop the package at the docks", pos: [-40, 0, 60], radius: 6 },
    ],
    medals: { bronze: { time: 300 }, gold: { time: 180, accuracy: 0.8 } },
    rewards: { cash: 1500, xp: 300 },
  },
] satisfies MissionInput[];
