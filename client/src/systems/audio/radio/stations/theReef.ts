// The Reef — chillwave / lo-fi / downtempo. Low-key cruising station.
// Track entries are config scaffolding; the offline asset pipeline supplies CC0/CC audio.
import type { StationDef } from "../types";
import { el, song } from "./util";

const S = "theReef";

export const theReef: StationDef = {
  id: S,
  name: "The Reef",
  genre: "Chillwave / Lo-Fi",
  colorHex: "#3fb6a8",
  seed: 0x12_ee_f5,
  dj: {
    persona: "Marlo — soft-spoken, philosophical host who sounds like they're always half-asleep on a hammock.",
    voice: "alloy",
    instructions: "Calm, breathy, gentle; long pauses; never raise your voice.",
  },
  clock: {
    pattern: ["song", "song", "song", "ident", "song", "djLink"],
    noRepeatWindow: 4,
    crossfadeSec: 3.5,
  },
  songs: [
    song(S, "tide_pool", 208, "Tide Pool", "Soft Current"),
    song(S, "seafoam", 197, "Seafoam", "Lull"),
    song(S, "slow_swell", 224, "Slow Swell", "Marlo & Moss"),
    song(S, "driftwood", 189, "Driftwood", "Coral Bloom"),
    song(S, "low_tide_lullaby", 236, "Low Tide Lullaby", "Hammock Theory"),
    song(S, "salt_air", 201, "Salt Air", "Pastel Reef"),
    song(S, "underwater_neon", 215, "Underwater Neon", "Deep End"),
    song(S, "sunday_haze", 193, "Sunday Haze", "Lull"),
  ],
  idents: [
    el(S, "ident", "id_easy", 5, { title: "The Reef — Take It Easy" }),
    el(S, "ident", "id_float", 4, { title: "Just Float" }),
  ],
  djLinks: [
    el(S, "djLink", "dj_marlo_calm", 31, { title: "Marlo — Slow Thought" }),
    el(S, "djLink", "dj_marlo_night", 27, { title: "Marlo — Late Set" }),
  ],
  ads: [
    el(S, "ad", "ad_wellness", 28, { title: "Blue Horizon Wellness Retreat" }),
    el(S, "ad", "ad_timeshare2", 30, { title: "Palm Crest Timeshares" }),
  ],
  sweepers: [
    el(S, "sweeper", "sw_water", 4, { title: "Water Sweeper" }),
    el(S, "sweeper", "sw_soft_chime", 3, { title: "Soft Chime" }),
  ],
};
