// THE CATALOG — the single source of truth mapping logical asset keys → CC0/CC-BY source +
// license metadata + a procedural placeholder spec. Other subsystems reference assets BY KEY
// (never a hardcoded path). Real binaries are fetched later per each entry's `credit.url`/`fetch`.
//
// Coverage goal: every gameplay enum (CharacterId / PedArchetype / VehicleId / WeaponId) resolves
// to a key here (enforced at compile time by the `satisfies Record<Enum, AssetKey>` maps below),
// plus the v0/v1 starter world set (roads, buildings, props, PBR surfaces, the Sunbreak HDRI,
// core SFX, radio stubs).

import { CharacterId, PedArchetype, VehicleId, WeaponId } from "@sunbreak/shared";
import type { Vec3Tuple } from "@sunbreak/shared";
import { makeCredit } from "./sources";
import type {
  AssetCategory,
  AssetCredit,
  AssetEntry,
  HdriPlaceholder,
  ModelEntry,
  ModelPlaceholder,
  TexturePlaceholder,
  AudioPlaceholder,
} from "./types";

// ── Entry factories (keep the big table below terse + uniform) ───────────────────────────────

function model(
  key: string,
  category: AssetCategory,
  path: string,
  placeholder: ModelPlaceholder,
  credit: AssetCredit,
  fetch: string,
  opts: { clips?: readonly string[]; colliderBox?: Vec3Tuple; tags?: readonly string[] } = {},
): ModelEntry {
  return {
    kind: "model",
    key,
    category,
    path,
    placeholder,
    credit,
    fetch,
    colliderBox: opts.colliderBox ?? placeholder.size,
    ...(opts.clips ? { clips: opts.clips } : {}),
    ...(opts.tags ? { tags: opts.tags } : {}),
  };
}

function texture(
  key: string,
  path: string,
  placeholder: TexturePlaceholder,
  credit: AssetCredit,
  fetch: string,
): AssetEntry {
  return { kind: "texture", key, category: "surface", path, placeholder, credit, fetch };
}

function hdri(
  key: string,
  path: string,
  placeholder: HdriPlaceholder,
  credit: AssetCredit,
  fetch: string,
): AssetEntry {
  return { kind: "hdri", key, category: "hdri", path, placeholder, credit, fetch };
}

function audio(
  key: string,
  category: "sfx" | "music",
  path: string,
  placeholder: AudioPlaceholder,
  credit: AssetCredit,
  fetch: string,
): AssetEntry {
  return {
    kind: "audio",
    key,
    category,
    path,
    placeholder,
    credit,
    fetch,
    ...(placeholder.loop ? { loop: true } : {}),
  };
}

/** Used for the "unarmed" slot — there is no external asset to fetch. */
const INTERNAL_CREDIT: AssetCredit = {
  name: "Procedural (no external asset)",
  author: "SUNBREAK",
  source: "internal",
  url: "",
  license: "CC0-1.0",
  requiresAttribution: false,
  dateObtained: "",
};

// Locomotion clip names we expect baked into rigged GLBs (Mixamo-named; Quaternius fallback maps 1:1).
const LOCOMOTION_CLIPS = [
  "Idle",
  "Walk",
  "Run",
  "Sprint",
  "Jump",
  "Fall",
  "StrafeLeft",
  "StrafeRight",
  "EnterVehicle",
  "ExitVehicle",
  "Sit",
] as const;

// ── The catalog ──────────────────────────────────────────────────────────────────────────────

export const ASSET_CATALOG = {
  // Playable leads (rigged, clips baked in). ──────────────────────────────────────────────────
  "char.cami": model(
    "char.cami",
    "character",
    "characters/cami.glb",
    { shape: "capsule", size: [0.6, 1.8, 0.4], color: 0xd98c5f },
    makeCredit("quaternius", "Ultimate Modular Women", "https://quaternius.com/packs/ultimatemodularwomen.html"),
    "Download Ultimate Modular Women (CC0), retexture Cami's outfit, bake Mixamo/Quaternius clips, export GLB → characters/cami.glb.",
    { clips: LOCOMOTION_CLIPS },
  ),
  "char.mac": model(
    "char.mac",
    "character",
    "characters/mac.glb",
    { shape: "capsule", size: [0.62, 1.85, 0.42], color: 0x6f8fb0 },
    makeCredit("quaternius", "Ultimate Modular Men", "https://quaternius.com/packs/ultimatemodularmen.html"),
    "Download Ultimate Modular Men (CC0), work-shirt retexture, bake clips, export GLB → characters/mac.glb.",
    { clips: LOCOMOTION_CLIPS },
  ),

  // CC0 animation library (de-risks the Adobe/Mixamo dependency). ──────────────────────────────
  "anim.locomotion": model(
    "anim.locomotion",
    "animation",
    "animations/universal_locomotion.glb",
    { shape: "capsule", size: [0.5, 1.7, 0.4], color: 0x8891a3 },
    makeCredit("quaternius", "Universal Animation Library 1 & 2", "https://quaternius.com/packs/universalanimationlibrary.html"),
    "Fully-CC0 locomotion set. Alternatively bake Mixamo clips into the rig GLBs. Export merged clips → animations/universal_locomotion.glb.",
    { clips: LOCOMOTION_CLIPS, tags: ["clips", "cc0-fallback"] },
  ),

  // Pedestrians (instancing-ready). ────────────────────────────────────────────────────────────
  "ped.civilian": model(
    "ped.civilian",
    "ped",
    "characters/ped_civilian.glb",
    { shape: "capsule", size: [0.55, 1.75, 0.4], color: 0x9aa4b2 },
    makeCredit("quaternius", "Background Posed Humans", "https://quaternius.com/packs/backgroundposedhumans.html"),
    "Quaternius crowd mesh + texture-swap variant; export → characters/ped_civilian.glb.",
    { clips: ["Idle", "Walk", "Run"], tags: ["instanced"] },
  ),
  "ped.business": model(
    "ped.business",
    "ped",
    "characters/ped_business.glb",
    { shape: "capsule", size: [0.55, 1.78, 0.4], color: 0x394a63 },
    makeCredit("quaternius", "Ultimate Animated Character Pack", "https://quaternius.com/packs/ultimateanimatedcharacter.html"),
    "Recolor to business attire; export → characters/ped_business.glb.",
    { clips: ["Idle", "Walk", "Run"], tags: ["instanced"] },
  ),
  "ped.tourist": model(
    "ped.tourist",
    "ped",
    "characters/ped_tourist.glb",
    { shape: "capsule", size: [0.55, 1.72, 0.4], color: 0xf2c14e },
    makeCredit("quaternius", "Ultimate Animated Character Pack", "https://quaternius.com/packs/ultimateanimatedcharacter.html"),
    "Bright tourist texture swap; export → characters/ped_tourist.glb.",
    { clips: ["Idle", "Walk", "Run"], tags: ["instanced"] },
  ),
  "ped.gangster": model(
    "ped.gangster",
    "ped",
    "characters/ped_gangster.glb",
    { shape: "capsule", size: [0.57, 1.8, 0.42], color: 0x2b2f36 },
    makeCredit("quaternius", "Ultimate Modular Men", "https://quaternius.com/packs/ultimatemodularmen.html"),
    "Faction recolor (Ceiba Locos/Reef Kings); export → characters/ped_gangster.glb.",
    { clips: ["Idle", "Walk", "Run"], tags: ["instanced"] },
  ),
  "ped.police": model(
    "ped.police",
    "ped",
    "characters/ped_police.glb",
    { shape: "capsule", size: [0.57, 1.8, 0.42], color: 0x2a3f6b },
    makeCredit("quaternius", "Ultimate Modular Men", "https://quaternius.com/packs/ultimatemodularmen.html"),
    "SVPD recolor; export → characters/ped_police.glb.",
    { clips: ["Idle", "Walk", "Run"], tags: ["instanced"] },
  ),

  // Vehicles (body + a separate wheel mesh for the Rapier raycast vehicle). ─────────────────────
  "veh.sedan": model(
    "veh.sedan",
    "vehicle",
    "vehicles/sedan.glb",
    { shape: "car", size: [1.9, 1.5, 4.4], color: 0x3f7cc2, metalness: 0.6, roughness: 0.35 },
    makeCredit("kenney", "Car Kit — Sedan", "https://kenney.nl/assets/car-kit"),
    "Kenney Car Kit sedan body with SEPARATE wheels; export body → vehicles/sedan.glb + wheel → vehicles/wheel.glb.",
    { tags: ["drivable"] },
  ),
  "veh.coupe": model(
    "veh.coupe",
    "vehicle",
    "vehicles/coupe.glb",
    { shape: "car", size: [1.9, 1.35, 4.3], color: 0xc0392b, metalness: 0.6, roughness: 0.3 },
    makeCredit("kenney", "Car Kit — Muscle/Coupe", "https://kenney.nl/assets/car-kit"),
    "Kenney Car Kit muscle body; export → vehicles/coupe.glb.",
    { tags: ["drivable"] },
  ),
  "veh.suv": model(
    "veh.suv",
    "vehicle",
    "vehicles/suv.glb",
    { shape: "car", size: [2.0, 1.8, 4.8], color: 0x2f4f2f, metalness: 0.5, roughness: 0.4 },
    makeCredit("kenney", "Car Kit — SUV", "https://kenney.nl/assets/car-kit"),
    "Kenney Car Kit SUV body; export → vehicles/suv.glb.",
    { tags: ["drivable"] },
  ),
  "veh.truck": model(
    "veh.truck",
    "vehicle",
    "vehicles/truck.glb",
    { shape: "car", size: [2.2, 2.4, 6.2], color: 0x8a8f98, metalness: 0.5, roughness: 0.45 },
    makeCredit("quaternius", "Cars Pack — Truck", "https://quaternius.com/packs/carkit.html"),
    "Quaternius Cars Pack truck; export → vehicles/truck.glb.",
    { tags: ["drivable"] },
  ),
  "veh.sports": model(
    "veh.sports",
    "vehicle",
    "vehicles/sports.glb",
    { shape: "car", size: [1.95, 1.15, 4.4], color: 0xe8b100, metalness: 0.7, roughness: 0.25 },
    makeCredit("kenney", "Car Kit — Sports", "https://kenney.nl/assets/car-kit"),
    "Kenney Car Kit sports body; export → vehicles/sports.glb.",
    { tags: ["drivable"] },
  ),
  "veh.police": model(
    "veh.police",
    "vehicle",
    "vehicles/police.glb",
    { shape: "car", size: [1.95, 1.5, 4.7], color: 0x14203a, emissive: 0x0033ff, metalness: 0.5, roughness: 0.35 },
    makeCredit("kenney", "Car Kit — Police recolor + light bar", "https://kenney.nl/assets/car-kit"),
    "Kenney Car Kit sedan recolor + light-bar prop; export → vehicles/police.glb.",
    { tags: ["drivable", "police"] },
  ),
  "veh.wheel": model(
    "veh.wheel",
    "vehicle",
    "vehicles/wheel.glb",
    { shape: "wheel", size: [0.3, 0.68, 0.68], color: 0x0c0d10, roughness: 0.9 },
    makeCredit("kenney", "Car Kit — Wheel", "https://kenney.nl/assets/car-kit"),
    "Single wheel mesh (origin at hub) for the Rapier raycast vehicle; export → vehicles/wheel.glb.",
    { tags: ["wheel"] },
  ),

  // Weapons. ───────────────────────────────────────────────────────────────────────────────────
  "wpn.none": model(
    "wpn.none",
    "weapon",
    "",
    { shape: "box", size: [0.02, 0.02, 0.02], color: 0x000000 },
    INTERNAL_CREDIT,
    "No mesh — represents unarmed/fists. Nothing to fetch.",
    { tags: ["nomesh"] },
  ),
  "wpn.pistol": model(
    "wpn.pistol",
    "weapon",
    "weapons/pistol.glb",
    { shape: "weapon", size: [0.05, 0.13, 0.28], color: 0x1c1f26, metalness: 0.7, roughness: 0.35 },
    makeCredit("kenney", "Blaster Kit — Pistol", "https://kenney.nl/assets/blaster-kit"),
    "Kenney Blaster Kit pistol; export → weapons/pistol.glb.",
  ),
  "wpn.rifle": model(
    "wpn.rifle",
    "weapon",
    "weapons/rifle.glb",
    { shape: "weapon", size: [0.06, 0.16, 0.9], color: 0x23262e, metalness: 0.7, roughness: 0.35 },
    makeCredit("kenney", "Blaster Kit — Rifle", "https://kenney.nl/assets/blaster-kit"),
    "Kenney Blaster Kit rifle; export → weapons/rifle.glb.",
  ),
  "wpn.shotgun": model(
    "wpn.shotgun",
    "weapon",
    "weapons/shotgun.glb",
    { shape: "weapon", size: [0.06, 0.16, 0.85], color: 0x3a2a1a, metalness: 0.6, roughness: 0.4 },
    makeCredit("quaternius", "Ultimate Guns — Shotgun", "https://quaternius.com/packs/ultimateguns.html"),
    "Quaternius Ultimate Guns shotgun; export → weapons/shotgun.glb.",
  ),
  "wpn.smg": model(
    "wpn.smg",
    "weapon",
    "weapons/smg.glb",
    { shape: "weapon", size: [0.06, 0.15, 0.5], color: 0x202329, metalness: 0.7, roughness: 0.35 },
    makeCredit("quaternius", "Modular Weapons — SMG", "https://quaternius.com/packs/modularweapons.html"),
    "Quaternius Modular Weapons SMG; export → weapons/smg.glb.",
  ),

  // Roads / streetscape (grid-aligned kit). ────────────────────────────────────────────────────
  "road.straight": model(
    "road.straight",
    "road",
    "buildings/road_straight.glb",
    { shape: "road", size: [8, 0.05, 8], color: 0x2b2d31, roughness: 0.95 },
    makeCredit("kenney", "City Kit (Roads) — Straight", "https://kenney.nl/assets/city-kit-roads"),
    "Kenney City Kit (Roads) straight tile; export → buildings/road_straight.glb.",
    { tags: ["kit", "grid"] },
  ),
  "road.intersection": model(
    "road.intersection",
    "road",
    "buildings/road_intersection.glb",
    { shape: "road", size: [8, 0.05, 8], color: 0x303338, roughness: 0.95 },
    makeCredit("kenney", "City Kit (Roads) — Intersection", "https://kenney.nl/assets/city-kit-roads"),
    "Kenney City Kit (Roads) 4-way; export → buildings/road_intersection.glb.",
    { tags: ["kit", "grid"] },
  ),
  "road.corner": model(
    "road.corner",
    "road",
    "buildings/road_corner.glb",
    { shape: "road", size: [8, 0.05, 8], color: 0x2e3034, roughness: 0.95 },
    makeCredit("kenney", "City Kit (Roads) — Corner", "https://kenney.nl/assets/city-kit-roads"),
    "Kenney City Kit (Roads) corner; export → buildings/road_corner.glb.",
    { tags: ["kit", "grid"] },
  ),
  "road.sidewalk": model(
    "road.sidewalk",
    "road",
    "buildings/sidewalk.glb",
    { shape: "road", size: [2, 0.12, 8], color: 0x6b6f76, roughness: 0.9 },
    makeCredit("kenney", "City Kit — Sidewalk", "https://kenney.nl/assets/city-kit-roads"),
    "Kenney City Kit sidewalk edge; export → buildings/sidewalk.glb.",
    { tags: ["kit", "grid"] },
  ),

  // Buildings (district kits). ─────────────────────────────────────────────────────────────────
  "bldg.tower": model(
    "bldg.tower",
    "building",
    "buildings/downtown_tower.glb",
    { shape: "building", size: [16, 60, 16], color: 0x5b6b82, roughness: 0.6, metalness: 0.2 },
    makeCredit("quaternius", "Downtown City MegaKit — Tower", "https://quaternius.com/packs/citykit.html"),
    "Quaternius Downtown City MegaKit tower (Solaris kitbash base); export → buildings/downtown_tower.glb.",
    { tags: ["kit"] },
  ),
  "bldg.shop": model(
    "bldg.shop",
    "building",
    "buildings/shopfront.glb",
    { shape: "building", size: [14, 8, 14], color: 0xb08968, roughness: 0.8 },
    makeCredit("kenney", "City Kit (Commercial) — Shopfront", "https://kenney.nl/assets/city-kit-commercial"),
    "Kenney City Kit (Commercial) shopfront; export → buildings/shopfront.glb.",
    { tags: ["kit"] },
  ),
  "bldg.house": model(
    "bldg.house",
    "building",
    "buildings/house.glb",
    { shape: "building", size: [10, 7, 12], color: 0xd9c7a3, roughness: 0.85 },
    makeCredit("kenney", "City Kit (Suburban) — House", "https://kenney.nl/assets/city-kit-suburban"),
    "Kenney City Kit (Suburban) house (Sunridge/Palmetto); export → buildings/house.glb.",
    { tags: ["kit"] },
  ),
  "bldg.neon": model(
    "bldg.neon",
    "building",
    "buildings/neon_block.glb",
    { shape: "building", size: [12, 24, 12], color: 0x1b1030, emissive: 0xff2d95, roughness: 0.4 },
    makeCredit("quaternius", "Cyberpunk Game Kit — Neon Block", "https://quaternius.com/packs/cyberpunkgamekit.html"),
    "Quaternius Cyberpunk Game Kit neon block (Neon Mile/The Mint); export → buildings/neon_block.glb.",
    { tags: ["kit", "neon"] },
  ),

  // Props / nature. ────────────────────────────────────────────────────────────────────────────
  "prop.container": model(
    "prop.container",
    "prop",
    "props/container.glb",
    { shape: "box", size: [2.4, 2.6, 6.0], color: 0xb5533b, roughness: 0.8, metalness: 0.3 },
    makeCredit("kenney", "Shipping container", "https://kenney.nl/assets"),
    "Kenney/Quaternius container prop (Puerto Vista); export → props/container.glb.",
  ),
  "prop.bench": model(
    "prop.bench",
    "prop",
    "props/bench.glb",
    { shape: "box", size: [1.6, 0.9, 0.5], color: 0x6b4a2f, roughness: 0.9 },
    makeCredit("kenney", "City Kit — Bench", "https://kenney.nl/assets"),
    "Street bench; export → props/bench.glb.",
  ),
  "prop.hydrant": model(
    "prop.hydrant",
    "prop",
    "props/hydrant.glb",
    { shape: "box", size: [0.35, 0.9, 0.35], color: 0xc0392b, roughness: 0.6, metalness: 0.3 },
    makeCredit("kenney", "City Kit — Fire hydrant", "https://kenney.nl/assets"),
    "Fire hydrant; export → props/hydrant.glb.",
  ),
  "prop.streetlight": model(
    "prop.streetlight",
    "prop",
    "props/streetlight.glb",
    { shape: "box", size: [0.2, 6, 0.2], color: 0x2b2d31, roughness: 0.6, metalness: 0.4 },
    makeCredit("kenney", "City Kit — Street light", "https://kenney.nl/assets"),
    "Street light pole; export → props/streetlight.glb.",
  ),
  "prop.dumpster": model(
    "prop.dumpster",
    "prop",
    "props/dumpster.glb",
    { shape: "box", size: [1.8, 1.4, 1.2], color: 0x2f6b3f, roughness: 0.8, metalness: 0.2 },
    makeCredit("kenney", "City Kit — Dumpster", "https://kenney.nl/assets"),
    "Dumpster; export → props/dumpster.glb.",
  ),
  "prop.barrier": model(
    "prop.barrier",
    "prop",
    "props/barrier.glb",
    { shape: "box", size: [1.2, 1.0, 0.4], color: 0xd98c1f, roughness: 0.8 },
    makeCredit("kenney", "City Kit — Barrier", "https://kenney.nl/assets"),
    "Traffic barrier; export → props/barrier.glb.",
  ),
  "prop.trafficLight": model(
    "prop.trafficLight",
    "prop",
    "props/traffic_light.glb",
    { shape: "box", size: [0.3, 3.5, 0.3], color: 0x1a1a1a, emissive: 0x00ff66, roughness: 0.5 },
    makeCredit("kenney", "City Kit — Traffic light", "https://kenney.nl/assets"),
    "Traffic light; export → props/traffic_light.glb.",
  ),
  "prop.neonSign": model(
    "prop.neonSign",
    "prop",
    "props/neon_sign.glb",
    { shape: "sign", size: [4, 2, 0.1], color: 0xff2d95, emissive: 0xff2d95 },
    makeCredit("quaternius", "Cyberpunk Game Kit — Emissive sign", "https://quaternius.com/packs/cyberpunkgamekit.html"),
    "Emissive neon sign plane; export → props/neon_sign.glb.",
    { tags: ["neon"] },
  ),
  "nature.palm": model(
    "nature.palm",
    "nature",
    "nature/palm.glb",
    { shape: "tree", size: [3.5, 7, 3.5], color: 0x3f7d3a, roughness: 0.95 },
    makeCredit("quaternius", "Stylized Nature MegaKit — Palm", "https://quaternius.com/packs/stylizednaturemegakit.html"),
    "Quaternius Stylized Nature MegaKit palm; export → nature/palm.glb.",
    { tags: ["instanced"] },
  ),

  // PBR surfaces (semi-real look, unified by postprocessing). ───────────────────────────────────
  "tex.asphalt": texture(
    "tex.asphalt",
    "textures/asphalt.ktx2",
    { pattern: "asphalt", color: 0x2a2c30, repeat: [8, 8], roughness: 0.95, metalness: 0 },
    makeCredit("ambientcg", "Asphalt (PBR)", "https://ambientcg.com/view?id=Asphalt013"),
    "ambientCG Asphalt013 → KTX2 (≤1k) → textures/asphalt.ktx2 (+ normal/roughness maps).",
  ),
  "tex.concrete": texture(
    "tex.concrete",
    "textures/concrete.ktx2",
    { pattern: "concrete", color: 0x9a9a95, repeat: [4, 4], roughness: 0.9, metalness: 0 },
    makeCredit("ambientcg", "Concrete (PBR)", "https://ambientcg.com/view?id=Concrete034"),
    "ambientCG Concrete034 → KTX2 → textures/concrete.ktx2.",
  ),
  "tex.sidewalk": texture(
    "tex.sidewalk",
    "textures/sidewalk.ktx2",
    { pattern: "paving", color: 0x8f9299, repeat: [6, 6], roughness: 0.9, metalness: 0 },
    makeCredit("ambientcg", "Paving stones (PBR)", "https://ambientcg.com/view?id=PavingStones128"),
    "ambientCG PavingStones128 → KTX2 → textures/sidewalk.ktx2.",
  ),
  "tex.stucco": texture(
    "tex.stucco",
    "textures/stucco.ktx2",
    { pattern: "stucco", color: 0xe8d8c0, repeat: [3, 3], roughness: 0.85, metalness: 0 },
    makeCredit("ambientcg", "Plaster/Stucco (PBR)", "https://ambientcg.com/view?id=Plaster001"),
    "ambientCG Plaster001 (pastel tint for Costa Dorada) → KTX2 → textures/stucco.ktx2.",
  ),
  "tex.sand": texture(
    "tex.sand",
    "textures/sand.ktx2",
    { pattern: "sand", color: 0xd9c18b, repeat: [10, 10], roughness: 1, metalness: 0 },
    makeCredit("ambientcg", "Beach sand (PBR)", "https://ambientcg.com/view?id=Ground054"),
    "ambientCG Ground054 → KTX2 → textures/sand.ktx2.",
  ),
  "tex.metal": texture(
    "tex.metal",
    "textures/metal.ktx2",
    { pattern: "metal", color: 0xb6bbc2, repeat: [2, 2], roughness: 0.4, metalness: 0.9 },
    makeCredit("ambientcg", "Metal plate (PBR)", "https://ambientcg.com/view?id=Metal032"),
    "ambientCG Metal032 → KTX2 → textures/metal.ktx2 (chrome/gold satire).",
  ),
  "tex.glass": texture(
    "tex.glass",
    "textures/glass.ktx2",
    { pattern: "glass", color: 0x8fb7d9, repeat: [1, 1], roughness: 0.05, metalness: 0.1 },
    makeCredit("polyhaven", "Glass (PBR)", "https://polyhaven.com/textures"),
    "Poly Haven/ambientCG glass surface → KTX2 → textures/glass.ktx2.",
  ),
  "tex.brick": texture(
    "tex.brick",
    "textures/brick.ktx2",
    { pattern: "brick", color: 0x8a4b3a, repeat: [4, 4], roughness: 0.9, metalness: 0 },
    makeCredit("ambientcg", "Bricks (PBR)", "https://ambientcg.com/view?id=Bricks066"),
    "ambientCG Bricks066 → KTX2 → textures/brick.ktx2.",
  ),

  // HDRIs (IBL + sky). "sunbreakDusk" is the signature hour. ───────────────────────────────────
  "hdri.sunbreakDusk": hdri(
    "hdri.sunbreakDusk",
    "hdri/sunbreak_dusk_2k.hdr",
    { sky: "dusk", zenith: 0x1b2a5e, horizon: 0xff9e5e, ground: 0x2a2320, intensity: 1, sun: true },
    makeCredit("polyhaven", "Venice Sunset (HDRI)", "https://polyhaven.com/a/venice_sunset"),
    "Poly Haven venice_sunset .hdr at 2k → hdri/sunbreak_dusk_2k.hdr (the signature IBL + sky).",
  ),
  "hdri.noon": hdri(
    "hdri.noon",
    "hdri/noon_2k.hdr",
    { sky: "noon", zenith: 0x4a86d6, horizon: 0xbfe0ff, ground: 0x6b6f5e, intensity: 1.2, sun: true },
    makeCredit("polyhaven", "Partly Cloudy Noon (HDRI)", "https://polyhaven.com/a/kloofendal_48d_partly_cloudy"),
    "Poly Haven kloofendal_48d_partly_cloudy .hdr at 2k → hdri/noon_2k.hdr.",
  ),
  "hdri.night": hdri(
    "hdri.night",
    "hdri/night_2k.hdr",
    { sky: "night", zenith: 0x05070f, horizon: 0x1a2233, ground: 0x090a0f, intensity: 0.4 },
    makeCredit("polyhaven", "Dikhololo Night (HDRI)", "https://polyhaven.com/a/dikhololo_night"),
    "Poly Haven dikhololo_night .hdr at 2k → hdri/night_2k.hdr.",
  ),
  "hdri.storm": hdri(
    "hdri.storm",
    "hdri/storm_2k.hdr",
    { sky: "storm", zenith: 0x3a3f47, horizon: 0x6a7078, ground: 0x2a2d31, intensity: 0.7 },
    makeCredit("polyhaven", "Overcast/Storm (HDRI)", "https://polyhaven.com/a/kloppenheim_06"),
    "Poly Haven kloppenheim_06 (hurricane weather) .hdr at 2k → hdri/storm_2k.hdr.",
  ),

  // SFX. ───────────────────────────────────────────────────────────────────────────────────────
  "sfx.footstepConcrete": audio(
    "sfx.footstepConcrete",
    "sfx",
    "audio/sfx/footstep_concrete.ogg",
    { tone: "thud", durationMs: 140, freqHz: 120, gain: 0.3 },
    makeCredit("freesound", "Footsteps — concrete", "https://freesound.org/search/?q=concrete+footsteps&f=license:%22Creative+Commons+0%22"),
    "Freesound CC0 concrete footstep set → .ogg (+ .mp3) → audio/sfx/footstep_concrete.ogg.",
  ),
  "sfx.footstepSand": audio(
    "sfx.footstepSand",
    "sfx",
    "audio/sfx/footstep_sand.ogg",
    { tone: "noise", durationMs: 130, gain: 0.22 },
    makeCredit("freesound", "Footsteps — sand", "https://freesound.org/search/?q=sand+footsteps&f=license:%22Creative+Commons+0%22"),
    "Freesound CC0 sand footstep set → audio/sfx/footstep_sand.ogg.",
  ),
  "sfx.engineIdle": audio(
    "sfx.engineIdle",
    "sfx",
    "audio/sfx/engine_idle.ogg",
    { tone: "engine", durationMs: 900, freqHz: 60, gain: 0.32, loop: true },
    makeCredit("pixabay", "Car engine idle", "https://pixabay.com/sound-effects/search/engine%20idle/"),
    "Pixabay/Freesound engine idle loop → audio/sfx/engine_idle.ogg (seamless loop).",
  ),
  "sfx.engineRev": audio(
    "sfx.engineRev",
    "sfx",
    "audio/sfx/engine_rev.ogg",
    { tone: "engine", durationMs: 700, freqHz: 110, gain: 0.38 },
    makeCredit("pixabay", "Car engine rev", "https://pixabay.com/sound-effects/search/engine%20rev/"),
    "Pixabay/Freesound engine rev → audio/sfx/engine_rev.ogg.",
  ),
  "sfx.tireScreech": audio(
    "sfx.tireScreech",
    "sfx",
    "audio/sfx/tire_screech.ogg",
    { tone: "noise", durationMs: 500, gain: 0.3 },
    makeCredit("freesound", "Tire screech", "https://freesound.org/search/?q=tire+screech&f=license:%22Creative+Commons+0%22"),
    "Freesound CC0 tire screech → audio/sfx/tire_screech.ogg.",
  ),
  "sfx.collision": audio(
    "sfx.collision",
    "sfx",
    "audio/sfx/collision.ogg",
    { tone: "thud", durationMs: 260, gain: 0.5 },
    makeCredit("freesound", "Vehicle collision", "https://freesound.org/search/?q=car+crash&f=license:%22Creative+Commons+0%22"),
    "Freesound CC0 collision/impact → audio/sfx/collision.ogg.",
  ),
  "sfx.uiClick": audio(
    "sfx.uiClick",
    "sfx",
    "audio/sfx/ui_click.ogg",
    { tone: "click", durationMs: 60, gain: 0.3 },
    makeCredit("kenney", "Interface Sounds — click", "https://kenney.nl/assets/interface-sounds"),
    "Kenney Interface Sounds click → audio/sfx/ui_click.ogg.",
  ),
  "sfx.siren": audio(
    "sfx.siren",
    "sfx",
    "audio/sfx/siren.ogg",
    { tone: "siren", durationMs: 1500, gain: 0.28, loop: true },
    makeCredit("freesound", "Police siren", "https://freesound.org/search/?q=police+siren&f=license:%22Creative+Commons+0%22"),
    "Freesound CC0 police siren loop → audio/sfx/siren.ogg.",
  ),
  "sfx.gunPistol": audio(
    "sfx.gunPistol",
    "sfx",
    "audio/sfx/gun_pistol.ogg",
    { tone: "noise", durationMs: 130, gain: 0.5 },
    makeCredit("freesound", "Pistol shot", "https://freesound.org/search/?q=pistol+shot&f=license:%22Creative+Commons+0%22"),
    "Freesound CC0 pistol shot → audio/sfx/gun_pistol.ogg.",
  ),
  "sfx.gunReload": audio(
    "sfx.gunReload",
    "sfx",
    "audio/sfx/gun_reload.ogg",
    { tone: "click", durationMs: 220, gain: 0.35 },
    makeCredit("freesound", "Gun reload", "https://freesound.org/search/?q=gun+reload&f=license:%22Creative+Commons+0%22"),
    "Freesound CC0 reload → audio/sfx/gun_reload.ogg.",
  ),

  // Music / radio (loopable placeholders; real loops fetched later). ────────────────────────────
  "music.menu": audio(
    "music.menu",
    "music",
    "audio/music/menu_loop.ogg",
    { tone: "beep", durationMs: 2000, freqHz: 220, gain: 0.08, loop: true },
    makeCredit("pixabay", "Menu loop", "https://pixabay.com/music/search/ambient/"),
    "Pixabay ambient menu loop → audio/music/menu_loop.ogg.",
  ),
  "music.neon103": audio(
    "music.neon103",
    "music",
    "audio/music/neon103.ogg",
    { tone: "beep", durationMs: 2000, freqHz: 330, gain: 0.08, loop: true },
    makeCredit("opengameart", "Neón 103 — synthwave", "https://opengameart.org/art-search-advanced?field_art_licenses_tid%5B%5D=4"),
    "OpenGameArt CC0 synthwave/retrowave → audio/music/neon103.ogg (Neón 103 station).",
  ),
  "music.solCaliente": audio(
    "music.solCaliente",
    "music",
    "audio/music/sol_caliente.ogg",
    { tone: "beep", durationMs: 2000, freqHz: 262, gain: 0.08, loop: true },
    makeCredit("pixabay", "Sol Caliente — Latin/tropical", "https://pixabay.com/music/search/latin/"),
    "Pixabay Latin/tropical → audio/music/sol_caliente.ogg (Sol Caliente station).",
  ),
  "music.305heat": audio(
    "music.305heat",
    "music",
    "audio/music/305_heat.ogg",
    { tone: "beep", durationMs: 2000, freqHz: 196, gain: 0.08, loop: true },
    makeCredit("pixabay", "305 Heat — trap", "https://pixabay.com/music/search/trap/"),
    "Pixabay trap/hip-hop beats → audio/music/305_heat.ogg (305 Heat station).",
  ),
  "music.chromeFm": audio(
    "music.chromeFm",
    "music",
    "audio/music/chrome_fm.ogg",
    { tone: "beep", durationMs: 2000, freqHz: 392, gain: 0.08, loop: true },
    makeCredit("incompetech", "Chrome FM — house (CC-BY)", "https://incompetech.com/music/royalty-free/music.html"),
    "Incompetech CC-BY house/electronic → audio/music/chrome_fm.ogg (Chrome FM). REQUIRES attribution.",
  ),
  "music.theSwamp": audio(
    "music.theSwamp",
    "music",
    "audio/music/the_swamp.ogg",
    { tone: "beep", durationMs: 2000, freqHz: 147, gain: 0.08, loop: true },
    makeCredit("freepd", "The Swamp — blues/country/rock", "https://freepd.com/misc.php"),
    "FreePD CC0 blues/country/rock → audio/music/the_swamp.ogg (The Swamp station).",
  ),
  "music.jingle": audio(
    "music.jingle",
    "music",
    "audio/music/jingle.ogg",
    { tone: "beep", durationMs: 600, freqHz: 523, gain: 0.1 },
    makeCredit("kenney", "Music Jingles — sting", "https://kenney.nl/assets/music-jingles"),
    "Kenney Music Jingles sting → audio/music/jingle.ogg (idents/mission stingers).",
  ),
} satisfies Record<string, AssetEntry>;

/** Every valid logical asset key (literal union), derived from the catalog itself. */
export type AssetKey = keyof typeof ASSET_CATALOG;

// ── Enum → key resolvers (compile-time complete: a missing enum member fails the build) ───────

export const CHARACTER_ASSET_KEYS = {
  [CharacterId.Cami]: "char.cami",
  [CharacterId.Mac]: "char.mac",
} satisfies Record<CharacterId, AssetKey>;

export const PED_ASSET_KEYS = {
  [PedArchetype.Civilian]: "ped.civilian",
  [PedArchetype.Business]: "ped.business",
  [PedArchetype.Tourist]: "ped.tourist",
  [PedArchetype.Gangster]: "ped.gangster",
  [PedArchetype.Police]: "ped.police",
} satisfies Record<PedArchetype, AssetKey>;

export const VEHICLE_ASSET_KEYS = {
  [VehicleId.Sedan]: "veh.sedan",
  [VehicleId.Coupe]: "veh.coupe",
  [VehicleId.Suv]: "veh.suv",
  [VehicleId.Truck]: "veh.truck",
  [VehicleId.Sports]: "veh.sports",
  [VehicleId.Police]: "veh.police",
} satisfies Record<VehicleId, AssetKey>;

export const WEAPON_ASSET_KEYS = {
  [WeaponId.Unarmed]: "wpn.none",
  [WeaponId.Fists]: "wpn.none",
  [WeaponId.Pistol]: "wpn.pistol",
  [WeaponId.Rifle]: "wpn.rifle",
  [WeaponId.Shotgun]: "wpn.shotgun",
  [WeaponId.Smg]: "wpn.smg",
} satisfies Record<WeaponId, AssetKey>;

/** The shared wheel mesh key for the Rapier raycast vehicle. */
export const VEHICLE_WHEEL_KEY = "veh.wheel" satisfies AssetKey;
