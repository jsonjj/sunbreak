// The streaming brain. Owns the resident set + a time-sliced load/unload pump, and wires
// together the loader, global instance pools, and the HLOD far ring. Everything is driven by the
// anchor (player) position — no camera needed (per-instance culling / hero LOD use anchor
// distance), so it can run entirely from an ECS `update` system. The single view root is exposed
// for the ECS↔R3F bridge to mount (we never hand-mount into App/Scene).
import * as THREE from "three";
import type { BuildingDesc, ChunkSource } from "./manifest";
import {
  CELL,
  HYSTERESIS,
  annulusChunks,
  chunkCheb,
  chunkKey,
  parseChunkKey,
  ringChunks,
  worldToChunk,
} from "./grid";
import { currentBudget } from "./budgets";
import { MaterialLibrary, type LodIndex } from "./assets";
import { InstancePools } from "./instancePools";
import { HLOD } from "./hlod";
import { ChunkLoader, type ChunkResident } from "./chunkLoader";

const now = typeof performance !== "undefined" ? () => performance.now() : () => Date.now();

/** Prop LOD band for a chunk at Chebyshev ring distance `cheb`. 0 hi / 1 mid / 2 low. */
function lodForCheb(cheb: number): LodIndex {
  return cheb <= 1 ? 0 : cheb <= 2 ? 1 : 2;
}

export interface StreamStats {
  tier: string;
  residentRing: number;
  resident: number;
  queuedLoad: number;
  queuedUnload: number;
  propInstances: number;
  hlodBlocks: number;
  drawCalls: number;
  triangles: number;
  centerKey: string;
}

export type ChunkListener = (resident: ChunkResident) => void;

export class ChunkManager {
  readonly root = new THREE.Group();
  private readonly staticRoot = new THREE.Group();
  readonly lib: MaterialLibrary;
  readonly pools: InstancePools;
  private readonly hlod: HLOD;
  private readonly loader: ChunkLoader;

  private source: ChunkSource;
  private readonly loaded = new Map<string, ChunkResident>();
  private readonly loadQueue: string[] = [];
  private readonly unloadQueue: string[] = [];
  private readonly queuedLoad = new Set<string>();
  private readonly queuedUnload = new Set<string>();
  private wanted = new Set<string>();

  private centerKey = "";
  private heroes: ChunkResident[] = [];
  private readonly readyListeners: ChunkListener[] = [];
  private readonly unloadListeners: ChunkListener[] = [];

  private ax = 0;
  private az = 0;
  private resetPending = false;

  constructor(source: ChunkSource) {
    this.root.name = "stream:root";
    this.staticRoot.name = "stream:static-root";
    this.lib = new MaterialLibrary();
    this.pools = new InstancePools(this.lib, currentBudget().propInstanceCap);
    this.hlod = new HLOD(this.lib);
    this.loader = new ChunkLoader(this.lib, this.pools);
    this.source = source;
    this.root.add(this.staticRoot, this.pools.root, this.hlod.root);
  }

  /** Swap the chunk source (e.g. when the city subsystem provides a real road-graph). Triggers a
   *  full rebuild on the next update. */
  setSource(source: ChunkSource): void {
    this.source = source;
    this.resetPending = true;
  }

  onChunkReady(cb: ChunkListener): () => void {
    this.readyListeners.push(cb);
    return () => {
      const i = this.readyListeners.indexOf(cb);
      if (i >= 0) this.readyListeners.splice(i, 1);
    };
  }

  onChunkUnload(cb: ChunkListener): () => void {
    this.unloadListeners.push(cb);
    return () => {
      const i = this.unloadListeners.indexOf(cb);
      if (i >= 0) this.unloadListeners.splice(i, 1);
    };
  }

  isResident(key: string): boolean {
    return this.loaded.has(key);
  }

  get residentKeys(): IterableIterator<string> {
    return this.loaded.keys();
  }

  private inBounds(cx: number, cz: number): boolean {
    const b = this.source.bounds;
    if (!b) return true;
    return cx >= b.minCx && cx <= b.maxCx && cz >= b.minCz && cz <= b.maxCz;
  }

  /**
   * Recompute the desired resident ring around the anchor (biased along its velocity so cells
   * resolve ahead of a fast car), diff against loaded, and enqueue load/unload work. Prop LOD
   * bands are refreshed and the HLOD far ring is rebuilt when the center chunk changes.
   */
  update(x: number, z: number, vx: number, vz: number): void {
    this.ax = x;
    this.az = z;
    const budget = currentBudget();
    const ring = budget.residentRing;

    // Velocity look-ahead: shift the ring center forward so streaming leads travel.
    const speed = Math.hypot(vx, vz);
    const lead = Math.min(speed * 1.4, CELL * ring); // seconds of look-ahead, capped to the ring
    const lx = speed > 0.5 ? x + (vx / speed) * lead : x;
    const lz = speed > 0.5 ? z + (vz / speed) * lead : z;
    const center = worldToChunk(lx, lz);
    const centerKey = chunkKey(center);

    if (this.resetPending) {
      for (const key of [...this.loaded.keys()]) this.doUnload(key);
      this.loadQueue.length = 0;
      this.unloadQueue.length = 0;
      this.queuedLoad.clear();
      this.queuedUnload.clear();
      this.centerKey = "";
      this.resetPending = false;
    }

    // Desired resident set (clamped to map bounds).
    const wanted = new Set<string>();
    for (const key of ringChunks(center, ring)) {
      const c = parseChunkKey(key);
      if (this.inBounds(c.cx, c.cz)) wanted.add(key);
    }
    this.wanted = wanted;

    // Enqueue loads for wanted-but-missing chunks, nearest first.
    const toLoad: string[] = [];
    for (const key of wanted) {
      if (this.loaded.has(key) || this.queuedLoad.has(key)) continue;
      toLoad.push(key);
    }
    toLoad.sort((a, b) => this.distToAnchorSq(a) - this.distToAnchorSq(b));
    for (const key of toLoad) {
      this.loadQueue.push(key);
      this.queuedLoad.add(key);
    }

    // Enqueue unloads past the ring + hysteresis; also refresh prop LOD bands for residents.
    const unloadThreshold = (ring + 0.5) * CELL + HYSTERESIS;
    for (const [key, resident] of this.loaded) {
      const coord = parseChunkKey(key);
      const cheb = chunkCheb(coord, center);
      if (!wanted.has(key) && Math.sqrt(this.distToAnchorSq(key)) > unloadThreshold) {
        if (!this.queuedUnload.has(key)) {
          this.unloadQueue.push(key);
          this.queuedUnload.add(key);
        }
      } else {
        const band = lodForCheb(cheb);
        if (band !== resident.lod) this.loader.setLod(resident, band);
      }
    }

    // HLOD far ring + hero LOD refresh only when the center chunk changes (cheap amortization).
    if (centerKey !== this.centerKey) {
      this.centerKey = centerKey;
      this.rebuildHlod(center, ring, budget.hlodRing);
    }
    for (const h of this.heroes) {
      if (h.hero) {
        const cc = { x: h.desc.hero!.pos[0], z: h.desc.hero!.pos[2] };
        h.hero.updateLod(Math.hypot(cc.x - x, cc.z - z));
      }
    }
  }

  private distToAnchorSq(key: string): number {
    const c = parseChunkKey(key);
    const cxw = c.cx * CELL + CELL * 0.5;
    const czw = c.cz * CELL + CELL * 0.5;
    const dx = cxw - this.ax;
    const dz = czw - this.az;
    return dx * dx + dz * dz;
  }

  private rebuildHlod(center: { cx: number; cz: number }, ring: number, hlodRing: number): void {
    const proxies: BuildingDesc[] = [];
    for (const key of annulusChunks(center, ring, hlodRing)) {
      const c = parseChunkKey(key);
      if (!this.inBounds(c.cx, c.cz)) continue;
      const desc = this.source.describe(c.cx, c.cz);
      if (desc) proxies.push(...desc.proxy);
    }
    this.hlod.rebuild(proxies);
  }

  /** Time-sliced work pump: cheap unloads first, then nearest loads, within `msBudget` ms/frame. */
  pump(msBudget = currentBudget().pumpMsBudget): void {
    const start = now();
    while (this.unloadQueue.length > 0 && now() - start < msBudget) {
      const key = this.unloadQueue.shift()!;
      this.queuedUnload.delete(key);
      if (this.loaded.has(key) && !this.wanted.has(key)) this.doUnload(key);
    }
    while (this.loadQueue.length > 0 && now() - start < msBudget) {
      const key = this.loadQueue.shift()!;
      this.queuedLoad.delete(key);
      if (!this.loaded.has(key) && this.wanted.has(key)) this.doLoad(key);
    }
  }

  private doLoad(key: string): void {
    const c = parseChunkKey(key);
    const desc = this.source.describe(c.cx, c.cz);
    if (!desc) return;
    const center = worldToChunk(this.ax, this.az);
    const band = lodForCheb(chunkCheb(c, center));
    const resident = this.loader.load(desc, band);
    this.staticRoot.add(resident.group);
    this.loaded.set(key, resident);
    if (resident.hero) this.heroes.push(resident);
    for (const cb of this.readyListeners) cb(resident);
  }

  private doUnload(key: string): void {
    const resident = this.loaded.get(key);
    if (!resident) return;
    for (const cb of this.unloadListeners) cb(resident);
    this.loader.unload(resident);
    this.loaded.delete(key);
    if (resident.hero) {
      const i = this.heroes.indexOf(resident);
      if (i >= 0) this.heroes.splice(i, 1);
    }
  }

  get stats(): StreamStats {
    const budget = currentBudget();
    let staticDraws = 0;
    let triangles = 0;
    for (const r of this.loaded.values()) {
      staticDraws += r.drawCalls;
      triangles += r.triangles;
    }
    return {
      tier: budget.tier,
      residentRing: budget.residentRing,
      resident: this.loaded.size,
      queuedLoad: this.loadQueue.length,
      queuedUnload: this.unloadQueue.length,
      propInstances: this.pools.activeCount,
      hlodBlocks: this.hlod.blockCount,
      drawCalls: staticDraws + this.pools.drawCalls + (this.hlod.blockCount > 0 ? 1 : 0),
      triangles,
      centerKey: this.centerKey,
    };
  }

  dispose(): void {
    for (const key of [...this.loaded.keys()]) this.doUnload(key);
    this.pools.dispose();
    this.hlod.dispose();
    this.lib.dispose();
    this.root.removeFromParent();
  }
}
