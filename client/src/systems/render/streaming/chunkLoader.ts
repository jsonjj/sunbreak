// Builds a resident chunk from a ChunkDesc and tears it down cleanly. "Loading" here is
// procedural geometry assembly (no baked .glb yet); it is intentionally cheap and synchronous so
// the ChunkManager can time-slice one chunk per pump() tick. Static geometry is merged by
// material and DISPOSED on unload; materials are shared singletons and are NOT disposed
// (refcount rule). Props go into the global InstancePools; a hero landmark gets a manual LOD
// group updated by anchor distance.
import * as THREE from "three";
import type { ChunkDesc, ColliderDesc } from "./manifest";
import { buildChunkStatic, buildHeroLevels, MaterialLibrary, type LodIndex } from "./assets";
import type { InstancePools } from "./instancePools";

export interface HeroInstance {
  readonly object: THREE.Group;
  updateLod(distance: number): void;
  dispose(): void;
}

export interface ChunkResident {
  key: string;
  desc: ChunkDesc;
  group: THREE.Group;
  colliders: ColliderDesc[];
  hero?: HeroInstance;
  lod: LodIndex;
  drawCalls: number;
  triangles: number;
}

function countTris(geo: THREE.BufferGeometry): number {
  const index = geo.getIndex();
  const pos = geo.getAttribute("position");
  return index ? index.count / 3 : pos ? pos.count / 3 : 0;
}

function buildHero(lib: MaterialLibrary, pos: [number, number, number], rotY: number, height: number): HeroInstance {
  const object = new THREE.Group();
  object.name = "stream:hero";
  object.position.set(pos[0], pos[1], pos[2]);
  object.rotation.y = rotY;

  const levels = buildHeroLevels(height);
  const levelGroups: { maxDist: number; group: THREE.Group }[] = [];
  for (const level of levels) {
    const g = new THREE.Group();
    for (const part of level.parts) {
      const mesh = new THREE.Mesh(part.geometry, lib.get(part.materialKey));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    g.visible = false;
    object.add(g);
    levelGroups.push({ maxDist: level.maxDist, group: g });
  }

  return {
    object,
    updateLod(distance: number) {
      let shown = false;
      for (const lvl of levelGroups) {
        const want = !shown && distance <= lvl.maxDist;
        if (lvl.group.visible !== want) lvl.group.visible = want;
        if (want) shown = true;
      }
    },
    dispose() {
      for (const lvl of levelGroups) {
        for (const child of lvl.group.children) {
          if (child instanceof THREE.Mesh) child.geometry.dispose();
        }
      }
    },
  };
}

export class ChunkLoader {
  constructor(
    private readonly lib: MaterialLibrary,
    private readonly pools: InstancePools,
  ) {}

  /** Assemble a chunk. `lod` is the coarse prop LOD band for its ring distance at load time. */
  load(desc: ChunkDesc, lod: LodIndex): ChunkResident {
    const group = new THREE.Group();
    group.name = `stream:chunk:${desc.key}`;

    const parts = buildChunkStatic(desc.buildings, desc.roads);
    let triangles = 0;
    for (const part of parts) {
      const mesh = new THREE.Mesh(part.geometry, this.lib.get(part.materialKey));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `stream:static:${part.materialKey}`;
      group.add(mesh);
      triangles += countTris(part.geometry);
    }

    let hero: HeroInstance | undefined;
    if (desc.hero) {
      hero = buildHero(this.lib, desc.hero.pos, desc.hero.rotY ?? 0, desc.hero.height ?? 120);
      group.add(hero.object);
    }

    this.pools.addForChunk(desc.key, desc.props, lod);

    return {
      key: desc.key,
      desc,
      group,
      colliders: desc.colliders,
      hero,
      lod,
      drawCalls: parts.length,
      triangles,
    };
  }

  setLod(resident: ChunkResident, lod: LodIndex): void {
    if (resident.lod === lod) return;
    this.pools.setChunkLod(resident.key, lod);
    resident.lod = lod;
  }

  /** Dispose per-chunk geometry, remove props from pools. Shared materials are left intact. */
  unload(resident: ChunkResident): void {
    this.pools.removeForChunk(resident.key);
    resident.group.removeFromParent();
    resident.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.name.startsWith("stream:static")) {
        obj.geometry.dispose();
      }
    });
    resident.hero?.dispose();
  }
}
