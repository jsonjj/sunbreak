// Sol 96 — sun-baked tropical / reggaeton / latin pop. The default "windows-down" station.
// NOTE: track entries are the data-driven config; the offline asset pipeline drops matching
// CC0/CC audio at each `src` and finalizes per-track credits (this agent ships no binaries).
import type { StationDef } from "../types";
import { el, song } from "./util";

const S = "sol96";

export const sol96: StationDef = {
  id: S,
  name: "Sol 96",
  genre: "Tropical / Reggaeton",
  colorHex: "#ff8a3d",
  seed: 0x50_96_01,
  dj: {
    persona: "Rita 'La Ola' Vega — warm, fast-talking bilingual host who treats the city like one big beach party.",
    voice: "shimmer",
    instructions: "Bright, playful, tropical energy; drop occasional Spanish; smile through every line.",
  },
  clock: {
    pattern: ["song", "song", "djLink", "song", "ad", "song", "ident"],
    noRepeatWindow: 4,
    crossfadeSec: 2.5,
  },
  songs: [
    song(S, "verano_bailar", 192, "Bailar Bajo el Sol", "Los del Malecón"),
    song(S, "marea_alta", 205, "Marea Alta", "Coral Sur"),
    song(S, "ritmo_costa", 178, "Ritmo de la Costa", "DJ Palmera"),
    song(S, "fuego_lento", 214, "Fuego Lento", "Nena Brava"),
    song(S, "noche_tropical", 188, "Noche Tropical", "El Sonido Dorado"),
    song(S, "dulce_caos", 176, "Dulce Caos", "Marisol & The Tide"),
    song(S, "arena_movediza", 199, "Arena Movediza", "Ritmo 96"),
    song(S, "sal_y_sol", 183, "Sal y Sol", "Los Verano"),
  ],
  idents: [
    el(S, "ident", "id_sunshine", 5, { title: "Sol 96 — All Sunshine" }),
    el(S, "ident", "id_ninety_six", 4, { title: "Ninety-Six" }),
  ],
  djLinks: [
    el(S, "djLink", "dj_beach_intro", 24, { title: "Rita — Beach Intro" }),
    el(S, "djLink", "dj_weather", 28, { title: "Rita — Weather + Traffic" }),
    el(S, "djLink", "dj_shoutout", 21, { title: "Rita — Listener Shoutout" }),
  ],
  ads: [
    el(S, "ad", "ad_coinyak", 29, { title: "CoinYak — Get Rich Quicker" }),
    el(S, "ad", "ad_storm_shutters", 27, { title: "Verano Storm Shutters" }),
  ],
  sweepers: [
    el(S, "sweeper", "sw_wave", 4, { title: "Wave Sweeper" }),
    el(S, "sweeper", "sw_horn", 3, { title: "Air-Horn Sweeper" }),
  ],
};
