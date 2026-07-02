// The material catalog: which CC0 set + tuning per surface. Authors reference these by id via
// `MaterialRegistry.get(id)` — they never `new` a raw material. Keeping this list small (≈≤30)
// bounds shader-program count and VRAM.
//
// `maps` URLs are intentionally omitted in v0 → the registry generates calibrated procedural maps
// so everything renders now. Drop in ambientCG/Poly Haven `.ktx2` sets later (albedo=SRGB,
// normal=NormalGL/linear, arm=AO/Rough/Metal/linear) and add the `maps` block — no code change.
import type { MaterialDef } from "../types";

export const materialDefs = {
  // ── Santa Vista neon-slick asphalt + streetscape ──────────────────────────
  asphalt: { id: "asphalt", master: "env", color: "#33363b", roughness: 0.95, metalness: 0, porosity: 1.0, puddleFactor: 1.0, repeat: [8, 8] },
  concrete: { id: "concrete", master: "env", color: "#9a9691", roughness: 0.9, metalness: 0, porosity: 0.7, puddleFactor: 0.5, repeat: [4, 4] },
  sidewalk: { id: "sidewalk", master: "env", color: "#adaaa2", roughness: 0.92, metalness: 0, porosity: 0.75, puddleFactor: 0.6, repeat: [3, 3] },
  brick: { id: "brick", master: "env", color: "#7d4a3b", roughness: 0.85, metalness: 0, porosity: 0.5, puddleFactor: 0.15, repeat: [5, 5] },
  plaster: { id: "plaster", master: "env", color: "#cbb9a0", roughness: 0.8, metalness: 0, porosity: 0.55, puddleFactor: 0.1, repeat: [3, 3] },
  metalPanel: { id: "metalPanel", master: "env", color: "#8b9199", roughness: 0.4, metalness: 0.9, porosity: 0.1, puddleFactor: 0.25, repeat: [2, 2] },
  // Keys salt/rust variant of metal (higher roughness, warmer tint)
  rustedMetal: { id: "rustedMetal", master: "env", color: "#7a5138", roughness: 0.75, metalness: 0.6, porosity: 0.6, puddleFactor: 0.2, repeat: [2, 2] },

  // ── Neon signage (emissive > 1 → Bloom) ───────────────────────────────────
  neonMagenta: { id: "neonMagenta", master: "emissive", color: "#0a0a0a", emissive: "#ff3aa8", emissiveIntensity: 2.6 },
  neonCyan: { id: "neonCyan", master: "emissive", color: "#0a0a0a", emissive: "#2ff3ff", emissiveIntensity: 2.4 },
  neonAmber: { id: "neonAmber", master: "emissive", color: "#0a0a0a", emissive: "#ffb347", emissiveIntensity: 2.2 },

  // ── Glass / windows ───────────────────────────────────────────────────────
  glassWindow: { id: "glassWindow", master: "glass", color: "#cfe8ff", roughness: 0.05, transmission: 1, ior: 1.45 },

  // ── Vehicles ──────────────────────────────────────────────────────────────
  carPaintRed: { id: "carPaintRed", master: "vehicle", color: "#b5121b", roughness: 0.35, metalness: 0.9, clearcoat: 1, porosity: 0.25, puddleFactor: 0.4 },
  carPaintBlue: { id: "carPaintBlue", master: "vehicle", color: "#1b4fb5", roughness: 0.35, metalness: 0.9, clearcoat: 1, porosity: 0.25, puddleFactor: 0.4 },

  // ── Foliage ───────────────────────────────────────────────────────────────
  palmLeaf: { id: "palmLeaf", master: "foliage", color: "#3f7d3a", roughness: 0.9, metalness: 0, alphaTest: 0.5 },
} satisfies Record<string, MaterialDef>;

export type MaterialDefId = keyof typeof materialDefs;

/** Fallback def used when an unknown id is requested (so callers never get undefined). */
export const DEFAULT_DEF_ID: MaterialDefId = "concrete";

/** Safe lookup that always resolves to a real def. */
export function resolveDef(id: string): MaterialDef {
  const table = materialDefs as Record<string, MaterialDef>;
  return table[id] ?? materialDefs[DEFAULT_DEF_ID];
}
