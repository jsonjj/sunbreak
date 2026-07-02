// Gutter Gold — hip-hop / trap / bass. The downtown grind station.
// Track entries are config scaffolding; the offline asset pipeline supplies CC0/CC audio.
import type { StationDef } from "../types";
import { el, song } from "./util";

const S = "gutterGold";

export const gutterGold: StationDef = {
  id: S,
  name: "Gutter Gold",
  genre: "Hip-Hop / Trap",
  colorHex: "#f2c14e",
  seed: 0x60_1d_99,
  dj: {
    persona: "Big Cee — hype, gravel-voiced hometown host who hypes every drop like a title fight.",
    voice: "echo",
    instructions: "Big, punchy, confident; ad-libs between lines; heavy on hometown pride.",
  },
  clock: {
    pattern: ["song", "song", "djLink", "song", "ad", "song", "sweeper"],
    noRepeatWindow: 4,
    crossfadeSec: 1.8,
  },
  songs: [
    song(S, "gutter_anthem", 174, "Gutter Anthem", "Cee Major"),
    song(S, "gold_teeth", 165, "Gold Teeth", "Lil Marisol"),
    song(S, "block_heat", 188, "Block Heat", "Santa Vista Click"),
    song(S, "trap_palms", 156, "Trap Palms", "Yung Reef"),
    song(S, "concrete_kings", 193, "Concrete Kings", "OG Verano"),
    song(S, "night_shift", 171, "Night Shift", "Duke & The Tide"),
    song(S, "no_ceiling", 149, "No Ceiling", "Cee Major"),
    song(S, "bando_sunrise", 182, "Bando Sunrise", "The Palms"),
  ],
  idents: [
    el(S, "ident", "id_solid_gold", 4, { title: "Gutter Gold — Solid" }),
    el(S, "ident", "id_turn_it_up", 3, { title: "Turn It Up" }),
  ],
  djLinks: [
    el(S, "djLink", "dj_bigcee_hype", 22, { title: "Big Cee — Hype Break" }),
    el(S, "djLink", "dj_freestyle_call", 27, { title: "Big Cee — Freestyle Callout" }),
  ],
  ads: [
    el(S, "ad", "ad_law_firm", 29, { title: "Marlowe & Sons — Injury Law" }),
    el(S, "ad", "ad_coinyak2", 26, { title: "CoinYak — To The Moon" }),
  ],
  sweepers: [
    el(S, "sweeper", "sw_airhorn", 3, { title: "Airhorn Drop" }),
    el(S, "sweeper", "sw_scratch", 4, { title: "Scratch Sweeper" }),
  ],
};
