// Sunset 84 — neon synthwave / retro-electro. Night-drive station.
// Track entries are config scaffolding; the offline asset pipeline supplies CC0/CC audio.
import type { StationDef } from "../types";
import { el, song } from "./util";

const S = "sunset84";

export const sunset84: StationDef = {
  id: S,
  name: "Sunset 84",
  genre: "Synthwave / Retro-Electro",
  colorHex: "#c14bd6",
  seed: 0x84_11_07,
  dj: {
    persona: "The Nightrider — smooth, unhurried late-night voice; speaks in cinematic one-liners.",
    voice: "onyx",
    instructions: "Low, cool, reverb-soaked; deliberate pauses; sound like a movie trailer at 2am.",
  },
  clock: {
    pattern: ["song", "ident", "song", "song", "djLink", "song", "sweeper"],
    noRepeatWindow: 4,
    crossfadeSec: 3,
  },
  songs: [
    song(S, "neon_mirage", 231, "Neon Mirage", "VHS Coast"),
    song(S, "chrome_heart", 218, "Chrome Heart", "Midnight Cassette"),
    song(S, "afterglow_drive", 245, "Afterglow Drive", "Laserhawk 84"),
    song(S, "electric_tide", 209, "Electric Tide", "Nova Ray"),
    song(S, "starlit_highway", 236, "Starlit Highway", "The Outrunner"),
    song(S, "violet_hour", 222, "Violet Hour", "Cassette Ghost"),
    song(S, "endless_summer_84", 251, "Endless Summer '84", "Retrograde"),
    song(S, "signal_lost", 198, "Signal Lost", "Neon District"),
  ],
  idents: [
    el(S, "ident", "id_after_dark", 5, { title: "Sunset 84 — After Dark" }),
    el(S, "ident", "id_neon", 4, { title: "All Neon, All Night" }),
  ],
  djLinks: [
    el(S, "djLink", "dj_nightrider_intro", 26, { title: "Nightrider — Cold Open" }),
    el(S, "djLink", "dj_dedication", 30, { title: "Nightrider — Dedication" }),
  ],
  ads: [
    el(S, "ad", "ad_energy_drink", 28, { title: "Voltage Energy — Stay Up" }),
    el(S, "ad", "ad_timeshare", 30, { title: "Palm Crest Timeshares" }),
  ],
  sweepers: [
    el(S, "sweeper", "sw_synth_riser", 5, { title: "Synth Riser" }),
    el(S, "sweeper", "sw_tape_stop", 3, { title: "Tape-Stop Sweeper" }),
  ],
};
