// ─────────────────────────────────────────────────────────────────────────────
// Bundled static content packs — the zero-key, always-available fallback
// ─────────────────────────────────────────────────────────────────────────────
// These hand-authored JSON packs are validated against the Zod schemas at import
// so a malformed pack can never leak into the game (bad items are dropped + logged
// rather than crashing the boot). They guarantee the world has content with no
// API key, no server, and no network — honoring the Cost Rule.

import type { z } from "zod";
import {
  BarkPackSchema,
  MissionSchema,
  RadioAdSchema,
  SideQuestSchema,
  type BarkPack,
  type Mission,
  type RadioAd,
  type SideQuest,
} from "../contract/schemas";
import barksRaw from "./authored.barks.json";
import radioAdsRaw from "./authored.radio-ads.json";
import missionsRaw from "./authored.missions.json";
import sidequestsRaw from "./authored.sidequests.json";

function validateArray<T>(schema: z.ZodType<T>, raw: unknown, label: string): T[] {
  if (!Array.isArray(raw)) {
    console.warn(`[dyn] authored pack "${label}" is not an array; skipping.`);
    return [];
  }
  const out: T[] = [];
  raw.forEach((item, i) => {
    const parsed = schema.safeParse(item);
    if (parsed.success) {
      out.push(parsed.data);
    } else {
      const why = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
        .join("; ");
      console.warn(`[dyn] dropped invalid ${label}[${i}] — ${why}`);
    }
  });
  return out;
}

export const authoredBarks: BarkPack[] = validateArray(BarkPackSchema, barksRaw, "barks");
export const authoredRadioAds: RadioAd[] = validateArray(RadioAdSchema, radioAdsRaw, "radio-ads");
export const authoredMissions: Mission[] = validateArray(MissionSchema, missionsRaw, "missions");
export const authoredSidequests: SideQuest[] = validateArray(
  SideQuestSchema,
  sidequestsRaw,
  "sidequests",
);

/** All authored packs in the same shape the server's `/content-packs` returns. */
export interface AuthoredContent {
  barks: BarkPack[];
  radioAds: RadioAd[];
  missions: Mission[];
  sidequests: SideQuest[];
}

export const authoredContent: AuthoredContent = {
  barks: authoredBarks,
  radioAds: authoredRadioAds,
  missions: authoredMissions,
  sidequests: authoredSidequests,
};
