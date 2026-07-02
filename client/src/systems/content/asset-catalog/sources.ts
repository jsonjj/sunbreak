// The approved free/redistributable sources (web-verified Jul 2026 per the sourcing plan) and a
// tiny credit builder so every catalog entry declares provenance consistently. Policy: default
// CC0; CC-BY allowed *with credit*; NC/ND and any non-CC0/non-CC-BY "free" download are BANNED.

import type { AssetCredit, AssetLicense } from "./types";

interface SourceDef {
  /** Default author label for the site (overridable per asset). */
  author: string;
  /** Human-facing site name. */
  site: string;
  /** Landing URL for the source (per-asset URLs override this). */
  home: string;
  license: AssetLicense;
  /** true for CC-BY* sources. */
  requiresAttribution: boolean;
}

/** Registry of vetted sources. Keys are used by `makeCredit(sourceKey, ...)`. */
export const SOURCES = {
  kenney: {
    author: "Kenney",
    site: "Kenney",
    home: "https://kenney.nl/assets",
    license: "CC0-1.0",
    requiresAttribution: false,
  },
  quaternius: {
    author: "Quaternius",
    site: "Quaternius",
    home: "https://quaternius.com",
    license: "CC0-1.0",
    requiresAttribution: false,
  },
  polyhaven: {
    author: "Poly Haven",
    site: "Poly Haven",
    home: "https://polyhaven.com",
    license: "CC0-1.0",
    requiresAttribution: false,
  },
  ambientcg: {
    author: "ambientCG",
    site: "ambientCG",
    home: "https://ambientcg.com",
    license: "CC0-1.0",
    requiresAttribution: false,
  },
  mixamo: {
    author: "Adobe Mixamo",
    site: "Mixamo",
    home: "https://www.mixamo.com",
    license: "Mixamo",
    requiresAttribution: false,
  },
  pixabay: {
    author: "Pixabay",
    site: "Pixabay",
    home: "https://pixabay.com/music",
    license: "Pixabay",
    requiresAttribution: false,
  },
  freepd: {
    author: "FreePD",
    site: "FreePD",
    home: "https://freepd.com",
    license: "CC0-1.0",
    requiresAttribution: false,
  },
  freesound: {
    author: "Freesound (CC0 filter)",
    site: "Freesound",
    home: "https://freesound.org",
    license: "CC0-1.0",
    requiresAttribution: false,
  },
  opengameart: {
    author: "OpenGameArt (CC0 filter)",
    site: "OpenGameArt",
    home: "https://opengameart.org",
    license: "CC0-1.0",
    requiresAttribution: false,
  },
  incompetech: {
    // Kevin MacLeod — CC-BY 4.0: attribution REQUIRED (drives the Credits screen).
    author: "Kevin MacLeod (Incompetech)",
    site: "Incompetech",
    home: "https://incompetech.com/music/royalty-free",
    license: "CC-BY-4.0",
    requiresAttribution: true,
  },
} as const satisfies Record<string, SourceDef>;

export type SourceKey = keyof typeof SOURCES;

/**
 * Build an AssetCredit from a vetted source. `dateObtained` defaults to "" to signal the real
 * file is NOT fetched yet (we're running on placeholders) — set it to an ISO date at download.
 */
export function makeCredit(
  source: SourceKey,
  name: string,
  url?: string,
  dateObtained = "",
  authorOverride?: string,
): AssetCredit {
  const s = SOURCES[source];
  return {
    name,
    author: authorOverride ?? s.author,
    source: s.site,
    url: url ?? s.home,
    license: s.license,
    requiresAttribution: s.requiresAttribution,
    dateObtained,
  };
}

/** Sourcing policy, exported so a Credits/About screen or the integrator can surface it verbatim. */
export const SOURCING_POLICY = {
  default: "CC0-1.0",
  allowedWithCredit: ["CC-BY-4.0", "CC-BY-3.0"] as const,
  banned: ["CC-*-NC", "CC-*-ND", "any non-CC0/non-CC-BY 'free' asset"] as const,
  rules: [
    "Never use assets to train ML models.",
    "Strip real trademarks/logos from any scan.",
    "Mixamo clips ship ONLY baked into our own GLBs (never as loose FBX).",
    "For Freesound/Sketchfab, screenshot the license at download and keep the record.",
    "Every shipped file must have a CREDITS entry (verify-credits CI gate).",
  ] as const,
} as const;
