// Velvet 92 — soul / R&B / funk. Smooth-cruise, golden-hour station.
// Track entries are config scaffolding; the offline asset pipeline supplies CC0/CC audio.
import type { StationDef } from "../types";
import { el, song } from "./util";

const S = "velvet92";

export const velvet92: StationDef = {
  id: S,
  name: "Velvet 92",
  genre: "Soul / R&B / Funk",
  colorHex: "#b23a5b",
  seed: 0x92_a1_0c,
  dj: {
    persona: "Dee Coleman — velvet-smooth veteran host with a slow, knowing laugh.",
    voice: "onyx",
    instructions: "Warm, rich, unhurried; a little flirtatious; classic late-night soul-DJ cadence.",
  },
  clock: {
    pattern: ["song", "song", "djLink", "song", "ident", "song", "ad"],
    noRepeatWindow: 4,
    crossfadeSec: 2.8,
  },
  songs: [
    song(S, "velvet_groove", 219, "Velvet Groove", "The Coleman Sound"),
    song(S, "midnight_silk", 231, "Midnight Silk", "Ruby Lane"),
    song(S, "slow_burn", 204, "Slow Burn", "Marcus Gold"),
    song(S, "honey_light", 198, "Honey Light", "The Satin Trio"),
    song(S, "golden_hour", 226, "Golden Hour", "Della & The Keys"),
    song(S, "smooth_operator_type", 212, "Smooth Talk", "Vince Marino"),
    song(S, "after_the_rain", 240, "After the Rain", "Ruby Lane"),
    song(S, "city_of_love", 207, "City of Love", "The Coleman Sound"),
  ],
  idents: [
    el(S, "ident", "id_smooth", 5, { title: "Velvet 92 — Smooth" }),
    el(S, "ident", "id_92", 4, { title: "Nine-Two" }),
  ],
  djLinks: [
    el(S, "djLink", "dj_dee_intro", 29, { title: "Dee — Smooth Intro" }),
    el(S, "djLink", "dj_dee_request", 26, { title: "Dee — Request Line" }),
  ],
  ads: [
    el(S, "ad", "ad_law_firm2", 29, { title: "Marlowe & Sons — Injury Law" }),
    el(S, "ad", "ad_energy_drink2", 27, { title: "Voltage Energy — Smooth Boost" }),
  ],
  sweepers: [
    el(S, "sweeper", "sw_sax", 5, { title: "Sax Sting" }),
    el(S, "sweeper", "sw_vinyl", 3, { title: "Vinyl Crackle Sweeper" }),
  ],
};
