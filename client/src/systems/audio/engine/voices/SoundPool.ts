// One `Howl` per asset id (its decoded buffer is cached once and reused across all instances).
// `acquire()` starts a new instance and returns its Howler sound id; `release()` frees the slot.
// Per-asset `maxInstances` is enforced here (steal-oldest); the global/per-category caps live in
// the VoiceManager.
import { Howl } from "howler";
import { getAsset, type AssetId } from "../library/manifest";

interface PoolEntry {
  howl: Howl;
  active: Set<number>;
  failed: boolean;
}

const pool = new Map<AssetId, PoolEntry>();
const loadWarned = new Set<AssetId>();

function ensure(id: AssetId): PoolEntry | null {
  const existing = pool.get(id);
  if (existing) return existing;
  const asset = getAsset(id);
  if (!asset) return null;
  const howl = new Howl({
    src: asset.src,
    volume: asset.volume ?? 1,
    html5: asset.html5 ?? false,
    sprite: asset.sprite,
    pool: asset.pool,
    preload: asset.preload ?? true,
    // NOTE: loop is set per-sound-id by the caller (emitters), not baked into the shared Howl.
    onloaderror: (_sid, err) => {
      const entry = pool.get(id);
      if (entry) entry.failed = true;
      if (!loadWarned.has(id)) {
        loadWarned.add(id);
        console.warn(`[audio] failed to load "${id}" (${asset.src[0]}):`, err);
      }
    },
  });
  const entry: PoolEntry = { howl, active: new Set(), failed: false };
  pool.set(id, entry);
  return entry;
}

export interface Acquired {
  howl: Howl;
  soundId: number;
}

export const SoundPool = {
  /** Start a new instance of `id` (optionally a sprite slice). Returns null if unknown/failed. */
  acquire(id: AssetId, sprite?: string): Acquired | null {
    const asset = getAsset(id);
    if (!asset) return null;
    const entry = ensure(id);
    if (!entry || entry.failed) return null;
    const max = asset.maxInstances ?? 4;
    while (entry.active.size >= max) {
      const oldest = entry.active.values().next().value;
      if (oldest === undefined) break;
      entry.howl.stop(oldest);
      entry.active.delete(oldest);
    }
    const soundId = sprite ? entry.howl.play(sprite) : entry.howl.play();
    entry.active.add(soundId);
    return { howl: entry.howl, soundId };
  },

  /** Free a previously-acquired instance slot (does not stop the sound — caller does that). */
  release(id: AssetId, soundId: number): void {
    pool.get(id)?.active.delete(soundId);
  },

  /** Stop + release a specific instance. */
  stop(id: AssetId, soundId: number): void {
    const entry = pool.get(id);
    if (!entry) return;
    entry.howl.stop(soundId);
    entry.active.delete(soundId);
  },

  /** The shared Howl for an asset (lazily created), or null if unknown/failed. */
  howl(id: AssetId): Howl | null {
    const entry = ensure(id);
    return entry && !entry.failed ? entry.howl : null;
  },

  /** Preload/warm assets (decode high-frequency SFX during loading screens). */
  warm(ids: readonly AssetId[]): void {
    for (const id of ids) {
      const entry = ensure(id);
      if (entry && entry.howl.state() === "unloaded") entry.howl.load();
    }
  },

  activeCount(id: AssetId): number {
    return pool.get(id)?.active.size ?? 0;
  },

  /** Unload every cached buffer (teardown). */
  unloadAll(): void {
    for (const entry of pool.values()) entry.howl.unload();
    pool.clear();
  },
};
