// content/data-format — seed NPC archetypes.
//
// The two leads (as mission givers), plus a vendor and a patrol cop. `dialogueSetId` links to
// the AI-dialogue personas; `loadout.weaponId` cross-references the seed weapons. Typed with
// `satisfies NpcInput[]`; validated + registered in `registerSeedContent()`.
import type { NpcInput } from "../schemas";

export const SEED_NPCS = [
  {
    id: "npc_mac",
    name: "Mac Doyle",
    archetype: "story",
    model: "characters/mac.glb",
    animSet: "male_a",
    behavior: "missionGiver",
    health: 150,
    loadout: { weaponId: "wpn_pistol" },
    dialogueSetId: "persona_mac",
    spawn: { districts: ["district_costa-dorada"], timeOfDay: ["any"], densityWeight: 0 },
    tags: ["lead"],
  },
  {
    id: "npc_cami",
    name: "Cami Reyes",
    archetype: "story",
    model: "characters/cami.glb",
    animSet: "female_a",
    behavior: "missionGiver",
    health: 150,
    loadout: { weaponId: "wpn_smg" },
    dialogueSetId: "persona_cami",
    spawn: { districts: ["district_costa-dorada"], timeOfDay: ["any"], densityWeight: 0 },
    tags: ["lead"],
  },
  {
    id: "npc_sol-vendor",
    name: "Calle Sol Vendor",
    archetype: "vendor",
    model: "characters/vendor.glb",
    behavior: "vendor",
    spawn: { districts: ["district_costa-dorada"], timeOfDay: ["day", "evening"], densityWeight: 1 },
  },
  {
    id: "npc_cop",
    name: "Santa Vista PD",
    archetype: "cop",
    model: "characters/cop.glb",
    behavior: "patrol",
    hostility: 0.3,
    health: 120,
    loadout: { weaponId: "wpn_pistol" },
    spawn: { districts: ["district_costa-dorada"], timeOfDay: ["any"], densityWeight: 2 },
  },
] satisfies NpcInput[];
