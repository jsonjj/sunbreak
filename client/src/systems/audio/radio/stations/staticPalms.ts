// Static Palms — indie / alt-rock / garage. High-energy, distortion-friendly station.
// Track entries are config scaffolding; the offline asset pipeline supplies CC0/CC audio.
import type { StationDef } from "../types";
import { el, song } from "./util";

const S = "staticPalms";

export const staticPalms: StationDef = {
  id: S,
  name: "Static Palms",
  genre: "Indie / Alt-Rock",
  colorHex: "#5bd66b",
  seed: 0x5a_11_ab,
  dj: {
    persona: "Jules — snarky, fast, opinionated college-radio host who loves a hot take.",
    voice: "fable",
    instructions: "Energetic, sardonic, quick; talk over intros; sound like you have too much coffee.",
  },
  clock: {
    pattern: ["song", "song", "sweeper", "song", "djLink", "song", "ad", "ident"],
    noRepeatWindow: 4,
    crossfadeSec: 1.5,
  },
  songs: [
    song(S, "palm_static", 176, "Palm Static", "The Overgrown"),
    song(S, "concrete_beach", 188, "Concrete Beach", "Motel Kids"),
    song(S, "sunstroke", 164, "Sunstroke", "Wax Lions"),
    song(S, "cheap_thrills_type", 171, "Cheap Fireworks", "Static Palms House Band"),
    song(S, "riptide_riot", 159, "Riptide Riot", "The Undertow"),
    song(S, "parking_lot_saints", 195, "Parking Lot Saints", "Neon Weeds"),
    song(S, "last_summer", 183, "Last Summer", "Motel Kids"),
    song(S, "dead_radio", 168, "Dead Radio", "The Overgrown"),
  ],
  idents: [
    el(S, "ident", "id_loud", 4, { title: "Static Palms — Loud" }),
    el(S, "ident", "id_no_rules", 3, { title: "No Rules Radio" }),
  ],
  djLinks: [
    el(S, "djLink", "dj_jules_rant", 25, { title: "Jules — Hot Take" }),
    el(S, "djLink", "dj_jules_newband", 28, { title: "Jules — New Band Spotlight" }),
  ],
  ads: [
    el(S, "ad", "ad_energy_drink3", 27, { title: "Voltage Energy — Riot Mode" }),
    el(S, "ad", "ad_coinyak3", 26, { title: "CoinYak — Diamond Palms" }),
  ],
  sweepers: [
    el(S, "sweeper", "sw_feedback", 4, { title: "Guitar Feedback Sweeper" }),
    el(S, "sweeper", "sw_static", 3, { title: "Static Burst" }),
  ],
};
