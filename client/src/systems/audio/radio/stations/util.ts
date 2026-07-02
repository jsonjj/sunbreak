// Small, dependency-free helpers for authoring station configs. Centralizes the on-disk asset
// convention so every station points at the same `client/public/audio/radio/...` layout.
import type { RadioCategory, RadioElement } from "../types";

/** Root of the same-origin radio asset tree (populated by the offline asset pipeline). */
export const RADIO_ASSET_ROOT = "/audio/radio";

const FOLDER: Record<RadioCategory, string> = {
  song: "music",
  djLink: "vo",
  ad: "vo",
  ident: "vo",
  sweeper: "vo",
  news: "vo",
};

/**
 * Build a `RadioElement` with the canonical src path `/audio/radio/<folder>/<station>/<id>.webm`.
 * `.webm`/Opus is preferred over MP3 (no encoder padding → gapless loops + clean crossfades).
 */
export function el(
  station: string,
  category: RadioCategory,
  id: string,
  durationSec: number,
  extra: Partial<Omit<RadioElement, "id" | "category" | "durationSec">> = {},
): RadioElement {
  return {
    id: `${station}_${id}`,
    category,
    src: extra.src ?? `${RADIO_ASSET_ROOT}/${FOLDER[category]}/${station}/${id}.webm`,
    durationSec,
    license: extra.license ?? "CC0",
    ...extra,
  };
}

/** Convenience for a music track. */
export const song = (
  station: string,
  id: string,
  durationSec: number,
  title: string,
  artist: string,
  extra: Partial<RadioElement> = {},
): RadioElement => el(station, "song", id, durationSec, { title, artist, ...extra });
