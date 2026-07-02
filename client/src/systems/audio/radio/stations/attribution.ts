// Attribution manifest for the radio subsystem. Every music bed ships CC0 or CC-BY; CC-BY /
// CC-BY-SA require a visible credit (surface these in a pause-menu credits screen). The offline
// asset pipeline finalizes per-track credits; this file records the approved source pools + rules.

export interface AttributionEntry {
  /** Source library the pool is drawn from. */
  source: string;
  url: string;
  /** License filter applied when pulling from this source. */
  license: "CC0" | "CC-BY" | "CC-BY-SA";
  /** How the pool is used across stations. */
  use: string;
}

export const RADIO_ATTRIBUTION: readonly AttributionEntry[] = [
  {
    source: "Free Music Archive",
    url: "https://freemusicarchive.org/",
    license: "CC0",
    use: "Station music beds across genres (verify CC0/CC-BY per track).",
  },
  {
    source: "ccMixter",
    url: "https://ccmixter.org/",
    license: "CC-BY",
    use: "Electronic / hip-hop / remix beds (attribution required).",
  },
  {
    source: "Freesound",
    url: "https://freesound.org/",
    license: "CC0",
    use: "Sweepers, station stings, radio static/tuning noise, ad SFX.",
  },
  {
    source: "SUNBREAK AI VO (OpenAI gpt-4o-mini-tts)",
    url: "internal://radio/vo",
    license: "CC0",
    use: "DJ links, idents and parody ads — generated offline, shipped as static Opus.",
  },
] as const;
