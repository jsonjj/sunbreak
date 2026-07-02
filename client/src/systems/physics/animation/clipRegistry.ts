// Clip registry: load once, key by canonical gait, cache immutable clips, share across every
// humanoid (only bones + AnimationMixer are per-instance). The driver is asset-agnostic — real
// Mixamo clip packs are injected via `registerLocomotionClips`; until then a procedural set is
// synthesized on demand so the whole pipeline runs free and with no binary assets.

import type { AnimationClip } from "three";
import { CLIP } from "./constants";
import { buildProceduralLocomotionClips } from "./proceduralClips";

export interface ClipSet {
  name: string;
  /** Canonical gait key ("idle"|"walk"|"run"|"sprint") → immutable clip. */
  byKey: Map<string, AnimationClip>;
  /** True if any member was synthesized (i.e. real Mixamo packs not yet registered). */
  procedural: boolean;
}

export interface RegisterOptions {
  /** Clip-set key (default "default"). Multiple rigs/skins can register distinct sets. */
  name?: string;
  /** Explicit clip.name → canonical-key overrides when auto-mapping is ambiguous. */
  map?: Partial<Record<string, string>>;
}

const DEFAULT_SET = "default";
const sets = new Map<string, ClipSet>();

const KEY_MATCHERS: ReadonlyArray<readonly [string, RegExp]> = [
  [CLIP.sprint, /(sprint|fast\s*run)/i],
  [CLIP.run, /(run|jog)/i],
  [CLIP.walk, /(walk)/i],
  [CLIP.idle, /(idle|breath|stand)/i],
];

/** Infer a canonical gait key from a raw clip name (Mixamo names vary: "Walking", "Fast Run"…). */
function inferKey(clipName: string, override?: Partial<Record<string, string>>): string | null {
  const forced = override?.[clipName];
  if (forced) return forced;
  for (const [key, re] of KEY_MATCHERS) if (re.test(clipName)) return key;
  return null;
}

/**
 * Assert a locomotion clip is authored "in place": either it has no root (Hips) position track,
 * or that track has ~no horizontal (XZ) travel. Returns true when in-place. Non-in-place clips
 * would double-apply translation on top of the Rapier-driven capsule and drift.
 */
export function assertInPlace(clip: AnimationClip, epsilon = 0.05): boolean {
  const hips = clip.tracks.find((t) => t.name.endsWith("Hips.position"));
  if (!hips) return true;
  const values = hips.values;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i + 2 < values.length; i += 3) {
    const x = values[i] ?? 0;
    const z = values[i + 2] ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return maxX - minX <= epsilon && maxZ - minZ <= epsilon;
}

function buildProceduralSet(name: string): ClipSet {
  const byKey = new Map<string, AnimationClip>();
  for (const clip of buildProceduralLocomotionClips()) byKey.set(clip.name, clip);
  return { name, byKey, procedural: true };
}

/**
 * Register real (e.g. Mixamo, in-place) locomotion clips as a named set. Auto-maps clip names to
 * canonical gait keys; any missing gait is back-filled from the procedural set so partial packs
 * still drive a complete blend tree. Non-in-place locomotion clips are warned about, not dropped.
 */
export function registerLocomotionClips(
  clips: readonly AnimationClip[],
  options: RegisterOptions = {},
): ClipSet {
  const name = options.name ?? DEFAULT_SET;
  const byKey = new Map<string, AnimationClip>();

  for (const clip of clips) {
    const key = inferKey(clip.name, options.map);
    if (!key) continue;
    if (!assertInPlace(clip)) {
      console.warn(
        `[physics/animation] clip "${clip.name}" (→ ${key}) is not in-place; ` +
          `expect foot slide/drift. Re-export from Mixamo with "In Place" checked.`,
      );
    }
    if (!byKey.has(key)) byKey.set(key, clip);
  }

  // Back-fill any gait the real pack didn't cover so the blend tree is always complete.
  let procedural = false;
  const missing = [CLIP.idle, CLIP.walk, CLIP.run, CLIP.sprint].filter((k) => !byKey.has(k));
  if (missing.length > 0) {
    procedural = true;
    const fallback = buildProceduralSet(name);
    for (const k of missing) {
      const clip = fallback.byKey.get(k);
      if (clip) byKey.set(k, clip);
    }
  }

  const set: ClipSet = { name, byKey, procedural };
  sets.set(name, set);
  return set;
}

/** Get a clip set, lazily synthesizing the procedural fallback for unknown/default names. */
export function getClipSet(name: string = DEFAULT_SET): ClipSet {
  const existing = sets.get(name);
  if (existing) return existing;
  const built = buildProceduralSet(name);
  sets.set(name, built);
  return built;
}

/** Look up a single canonical clip within a set (undefined if absent). */
export function getClip(key: string, setName: string = DEFAULT_SET): AnimationClip | undefined {
  return getClipSet(setName).byKey.get(key);
}

/** True if a set is registered and backed entirely by real (non-procedural) clips. */
export function hasRealClips(name: string = DEFAULT_SET): boolean {
  const s = sets.get(name);
  return !!s && !s.procedural;
}

/** Test seam: drop all registered sets (procedural sets re-synthesize on next `getClipSet`). */
export function resetClipRegistry(): void {
  sets.clear();
}
