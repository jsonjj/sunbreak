// Attribution + fetch manifests, derived from the catalog. This is the code-side of the spec's
// CREDITS.json → ATTRIBUTIONS.md + in-game credits pipeline: because provenance lives on every
// entry, we can generate the Credits screen data and the "what to download" list for free, and a
// future CI gate can assert every shipped file has a credit.

import { ASSET_CATALOG } from "./catalog";
import type { AssetKey } from "./catalog";
import type { AssetCategory, AssetCredit, AssetKind, AssetLicense } from "./types";

/** A credit enriched with the catalog key + shipped file path (mirrors spec's CREDITS.json rows). */
export interface CreditRecord extends AssetCredit {
  key: AssetKey;
  /** Shipped path, e.g. "assets/vehicles/sedan.glb" (empty for procedural-only entries). */
  file: string;
  kind: AssetKind;
  category: AssetCategory;
}

const keys = (): AssetKey[] => Object.keys(ASSET_CATALOG) as AssetKey[];
const fileOf = (path: string): string => (path ? `assets/${path}` : "");

/** Every catalog entry as a credit row (the data behind an in-game Credits screen / credits.json). */
export function getAllCredits(): CreditRecord[] {
  return keys().map((key) => {
    const e = ASSET_CATALOG[key];
    return { key, file: fileOf(e.path), kind: e.kind, category: e.category, ...e.credit };
  });
}

/** Only the CC-BY* assets that MUST be credited in-product. */
export function getRequiredAttributions(): CreditRecord[] {
  return getAllCredits().filter((c) => c.requiresAttribution);
}

/** Count of assets per license (handy for a policy/health readout). */
export function getLicenseSummary(): Record<AssetLicense | "internal", number> {
  const summary = {} as Record<string, number>;
  for (const c of getAllCredits()) summary[c.license] = (summary[c.license] ?? 0) + 1;
  return summary as Record<AssetLicense | "internal", number>;
}

/** A downloadable task: which real free file to fetch, from where, under which license, and how. */
export interface FetchTask {
  key: AssetKey;
  file: string;
  license: AssetLicense;
  source: string;
  url: string;
  instructions: string;
}

/** Everything that still needs a real binary fetched + processed (excludes procedural-only slots). */
export function getFetchManifest(): FetchTask[] {
  return keys()
    .map((key) => {
      const e = ASSET_CATALOG[key];
      return {
        key,
        file: fileOf(e.path),
        license: e.credit.license,
        source: e.credit.source,
        url: e.credit.url,
        instructions: e.fetch,
      };
    })
    .filter((t) => t.file !== "");
}

/** Render a human-readable ATTRIBUTIONS.md (ship in the build; also drives the Credits screen). */
export function buildAttributionsMarkdown(): string {
  const lines: string[] = [
    "# SUNBREAK — Asset Attributions",
    "",
    "All assets are free and redistributable (CC0, CC-BY with credit, or an explicit royalty-free grant).",
    "",
  ];
  const required = getRequiredAttributions();
  if (required.length > 0) {
    lines.push("## Required attribution (CC-BY)", "");
    for (const c of required) {
      lines.push(`- **${c.name}** — ${c.author} — ${c.license} — <${c.url}>`);
    }
    lines.push("");
  }
  lines.push("## All sources", "");
  for (const c of getAllCredits()) {
    const where = c.file || `(${c.key})`;
    lines.push(`- \`${where}\` — ${c.name} — ${c.author} (${c.source}, ${c.license})`);
  }
  lines.push("");
  return lines.join("\n");
}
