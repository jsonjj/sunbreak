// ─────────────────────────────────────────────────────────────────────────────
// SUNBREAK world canon — grounding registries for AI dynamic content (client copy)
// ─────────────────────────────────────────────────────────────────────────────
// Single source of the enumerable world facts every generated/authored item is
// validated against: districts, factions, radio stations, satirical brands, plus
// the ambient enums (mood/speaker/weather/time). Content that references anything
// outside these sets is rejected by the Zod schemas (see contract/schemas.ts),
// which IS our referential-integrity gate for v1.
//
// NOTE FOR THE INTEGRATOR: per the spec this canon should ultimately live in
// `shared/src/ai/canon.ts` and be re-exported from the World / Radio / Narrative
// subsystems. It is duplicated here because this agent owns only its own folder
// and may not touch `shared/**`. Keep the two in sync when promoting.
//
// All names are original IP. Brand parody stays transformative ("punch up, not
// down") per BUILD-CANON's IP rule — no real-world brands, songs, or people.

import { z } from "zod";

/** A helper to build a Zod enum + a fast membership Set + the readonly tuple. */
function registry<const T extends readonly [string, ...string[]]>(values: T) {
  const set = new Set<string>(values);
  return {
    values,
    schema: z.enum(values),
    has: (v: string): v is T[number] => set.has(v),
  } as const;
}

// --- Districts of Santa Vista (state of Verano) ------------------------------
export const DISTRICTS = registry([
  "el_recodo", // dense working-class barrio; markets, low-riders, murals
  "deacons_mill", // faded industrial edge; warehouses, docks, rust
  "little_ayiti", // vibrant diaspora quarter; food stalls, street music
  "the_keys", // moneyed marina + nightlife strip; yachts, neon, velvet rope
  "the_glades", // swampy outskirts; airboats, trailer roads, gator country
  "downtown", // glass towers, finance, tourists, over-policed core
] as const);

export const DISTRICT_LABELS: Record<Distinct<typeof DISTRICTS>, string> = {
  el_recodo: "El Recodo",
  deacons_mill: "Deacon's Mill",
  little_ayiti: "Little Ayiti",
  the_keys: "The Keys",
  the_glades: "The Glades",
  downtown: "Downtown",
};

// --- Factions / crews --------------------------------------------------------
export const FACTIONS = registry([
  "serpientes", // El Recodo street crew
  "dixie_combine", // Deacon's Mill haulers-turned-smugglers
  "zafra_cartel", // sugar-&-rum trafficking outfit out of the Glades
  "neon_keys", // the Keys money: club owners, laundered cash
  "svpd", // Santa Vista Police Department
  "civilian", // unaffiliated public
] as const);

export const FACTION_LABELS: Record<Distinct<typeof FACTIONS>, string> = {
  serpientes: "Los Serpientes",
  dixie_combine: "The Dixie Combine",
  zafra_cartel: "Zafra Cartel",
  neon_keys: "Neon Keys",
  svpd: "Santa Vista PD",
  civilian: "Civilian",
};

// --- Radio stations (owned long-term by audio/radio) -------------------------
export const STATIONS = registry([
  "sunburst_fm", // sun-pop / throwback hits
  "wave_101", // dance / electronic
  "dusty_roads", // country / swamp americana
  "la_mezcla", // latin / tropical
  "static_talk", // conspiracy talk radio
  "bump_713", // hip-hop / bass
] as const);

export const STATION_GENRE: Record<Distinct<typeof STATIONS>, string> = {
  sunburst_fm: "sun-pop",
  wave_101: "dance",
  dusty_roads: "swamp-country",
  la_mezcla: "tropical-latin",
  static_talk: "talk",
  bump_713: "hip-hop",
};

// --- Satirical advertiser brands (transformative parody) ---------------------
export const BRANDS = registry([
  "coinyak", // meme crypto exchange
  "strand_grubb", // ambulance-chaser law firm "Strand & Grubb"
  "stormguard", // overpriced storm-shutter scam
  "verano_vice", // radioactive-green energy drink
  "sunny_loans", // predatory title / payday loans
  "paradise_boats", // dodgy used-boat lot
  "pollo_supremo", // fast-food fried chicken empire
  "keys_kondos", // pre-construction condo hype ("Keys Kondos")
] as const);

export const BRAND_LABELS: Record<Distinct<typeof BRANDS>, string> = {
  coinyak: "CoinYak",
  strand_grubb: "Strand & Grubb",
  stormguard: "StormGuard Shutters",
  verano_vice: "Verano Vice",
  sunny_loans: "Sunny Day Loans",
  paradise_boats: "Paradise Boat Depot",
  pollo_supremo: "Pollo Supremo",
  keys_kondos: "Keys Kondos",
};

// --- Ambient enums -----------------------------------------------------------
export const MOODS = registry(["calm", "tense", "festive", "storm"] as const);
export const SPEAKERS = registry([
  "civilian",
  "vendor",
  "tourist",
  "gangster",
  "cop",
] as const);
export const WEATHER = registry(["clear", "overcast", "rain", "storm"] as const);
export const TIMES_OF_DAY = registry(["dawn", "day", "dusk", "night"] as const);

export const MISSION_TYPES = registry([
  "debt_shakedown",
  "smuggling_run",
  "bounty",
  "repo",
  "protection",
  "courier",
] as const);

export const OBJECTIVE_KINDS = registry([
  "go_to",
  "collect",
  "deliver",
  "eliminate",
  "survive",
  "evade",
  "steal_vehicle",
] as const);

/** The two playable leads (mirror of shared CharacterId — kept as strings so this
 *  file has no dependency on the shared enum's runtime shape). */
export const LEADS = registry(["cami", "mac"] as const);

// --- Type helpers ------------------------------------------------------------
type Distinct<R extends { values: readonly string[] }> = R["values"][number];

export type District = Distinct<typeof DISTRICTS>;
export type Faction = Distinct<typeof FACTIONS>;
export type Station = Distinct<typeof STATIONS>;
export type Brand = Distinct<typeof BRANDS>;
export type Mood = Distinct<typeof MOODS>;
export type Speaker = Distinct<typeof SPEAKERS>;
export type Weather = Distinct<typeof WEATHER>;
export type TimeOfDay = Distinct<typeof TIMES_OF_DAY>;
export type MissionType = Distinct<typeof MISSION_TYPES>;
export type ObjectiveKind = Distinct<typeof OBJECTIVE_KINDS>;
export type Lead = Distinct<typeof LEADS>;
