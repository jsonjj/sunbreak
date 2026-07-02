// THREE mesh assembly from the map doc. All geometry is CPU-built here and consumed by the ECS
// render entity's `three` view component (see render.ts). Draw-call strategy per the spec:
//   • buildings  → THREE.BatchedMesh (many distinct geos, ONE material, per-instance culling)
//   • props      → THREE.InstancedMesh per type (one draw call each)
//   • roads/etc  → merged geometry, one mesh per surface
// Building variety comes from per-vertex color, so a whole family shares a single material.
import * as THREE from "three";
import type { CityMaterials } from "./materials";
import type { BuildingSpec, CityMapDoc, Landmark, PropType, RoadNode } from "./types";

export interface CityBuild {
  root: THREE.Group;
  /** materials whose glow the render system pulses for the neon districts. */
  neonMaterials: THREE.MeshBasicMaterial[];
  buildingCount: number;
  drawGroups: number;
  dispose: () => void;
}

// ── vertex color helper ───────────────────────────────────────────────────────

function applyVertexColor(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex).convertSRGBToLinear();
  const pos = geo.getAttribute("position");
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

// ── flat surface (roads / sidewalks / crosswalks) builder ─────────────────────

class SurfaceArrays {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];

  private vert(x: number, y: number, z: number, uvScale: number): void {
    this.pos.push(x, y, z);
    this.nrm.push(0, 1, 0);
    this.uv.push(x / uvScale, z / uvScale);
  }

  orientedQuad(ax: number, az: number, bx: number, bz: number, half: number, y: number, uvScale: number): void {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    const nx = (-dz / len) * half;
    const nz = (dx / len) * half;
    const p0x = ax + nx, p0z = az + nz;
    const p1x = bx + nx, p1z = bz + nz;
    const p2x = bx - nx, p2z = bz - nz;
    const p3x = ax - nx, p3z = az - nz;
    this.vert(p0x, y, p0z, uvScale);
    this.vert(p1x, y, p1z, uvScale);
    this.vert(p2x, y, p2z, uvScale);
    this.vert(p0x, y, p0z, uvScale);
    this.vert(p2x, y, p2z, uvScale);
    this.vert(p3x, y, p3z, uvScale);
  }

  rect(cx: number, cz: number, hx: number, hz: number, y: number, uvScale: number): void {
    this.vert(cx - hx, y, cz - hz, uvScale);
    this.vert(cx + hx, y, cz - hz, uvScale);
    this.vert(cx + hx, y, cz + hz, uvScale);
    this.vert(cx - hx, y, cz - hz, uvScale);
    this.vert(cx + hx, y, cz + hz, uvScale);
    this.vert(cx - hx, y, cz + hz, uvScale);
  }

  empty(): boolean {
    return this.pos.length === 0;
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

// ── roads / sidewalks / crosswalks ────────────────────────────────────────────

function buildRoads(doc: CityMapDoc, mats: CityMaterials, root: THREE.Group): void {
  const nodeById = new Map<number, RoadNode>();
  for (const n of doc.roads.nodes) nodeById.set(n.id, n);

  const road = new SurfaceArrays();
  for (const e of doc.roads.edges) {
    const a = nodeById.get(e.a);
    const b = nodeById.get(e.b);
    if (!a || !b) continue;
    road.orientedQuad(a.x, a.z, b.x, b.z, e.width / 2, 0.02, 6);
  }
  if (!road.empty()) {
    const m = new THREE.Mesh(road.toGeometry(), mats.asphalt);
    m.receiveShadow = true;
    m.name = "city:roads";
    root.add(m);
  }

  const walk = new SurfaceArrays();
  for (const s of doc.sidewalks) walk.orientedQuad(s.a.x, s.a.z, s.b.x, s.b.z, s.width / 2, 0.05, 2);
  if (!walk.empty()) {
    const m = new THREE.Mesh(walk.toGeometry(), mats.sidewalk);
    m.receiveShadow = true;
    m.name = "city:sidewalks";
    root.add(m);
  }

  const cross = new SurfaceArrays();
  for (const c of doc.crosswalks) {
    cross.rect(c.at.x, c.at.z, c.length / 2, 1.5, 0.07, 1); // E-W bar
    cross.rect(c.at.x, c.at.z, 1.5, c.length / 2, 0.07, 1); // N-S bar
  }
  if (!cross.empty()) {
    const m = new THREE.Mesh(cross.toGeometry(), mats.crosswalk);
    m.name = "city:crosswalks";
    root.add(m);
  }
}

// ── buildings (BatchedMesh per material family) ───────────────────────────────

interface FamilyCounts {
  instances: number;
  verts: number;
  indices: number;
}

const BOX_VERTS = 24;
const BOX_INDICES = 36;

function familyOf(b: BuildingSpec): "glass" | "neon" | "opaque" {
  if (b.glass) return "glass";
  if (b.emissive) return "neon";
  return "opaque";
}

function buildBuildings(doc: CityMapDoc, mats: CityMaterials, root: THREE.Group): number {
  const counts: Record<string, FamilyCounts> = {
    glass: { instances: 0, verts: 0, indices: 0 },
    neon: { instances: 0, verts: 0, indices: 0 },
    opaque: { instances: 0, verts: 0, indices: 0 },
  };
  for (const b of doc.buildings) {
    const parts = b.setbackTop ? 2 : 1;
    const c = counts[familyOf(b)]!;
    c.instances += parts;
    c.verts += parts * BOX_VERTS;
    c.indices += parts * BOX_INDICES;
  }

  const materialFor = { glass: mats.buildingGlass, neon: mats.buildingNeon, opaque: mats.buildingOpaque };
  const batched: Partial<Record<string, THREE.BatchedMesh>> = {};
  let drawGroups = 0;
  for (const key of ["opaque", "glass", "neon"] as const) {
    const c = counts[key]!;
    if (c.instances === 0) continue;
    const bm = new THREE.BatchedMesh(c.instances, c.verts, c.indices, materialFor[key]);
    bm.name = `city:buildings:${key}`;
    bm.frustumCulled = false; // rely on per-instance culling; whole-mesh sphere spans the city
    bm.perObjectFrustumCulled = true;
    batched[key] = bm;
    root.add(bm);
    drawGroups++;
  }

  const mtx = new THREE.Matrix4();
  const addBox = (
    bm: THREE.BatchedMesh,
    w: number,
    h: number,
    d: number,
    color: string,
    cx: number,
    cy: number,
    cz: number,
  ) => {
    const geo = applyVertexColor(new THREE.BoxGeometry(w, h, d), color);
    const gid = bm.addGeometry(geo);
    const iid = bm.addInstance(gid);
    bm.setMatrixAt(iid, mtx.makeTranslation(cx, cy, cz));
    geo.dispose(); // BatchedMesh copies into its own buffers
  };

  for (const b of doc.buildings) {
    const bm = batched[familyOf(b)];
    if (!bm) continue;
    if (b.setbackTop) {
      const baseH = b.height * 0.72;
      const crownH = b.height - baseH;
      addBox(bm, b.width, baseH, b.depth, b.color, b.center.x, baseH / 2, b.center.z);
      addBox(bm, b.width * 0.62, crownH, b.depth * 0.62, b.color, b.center.x, baseH + crownH / 2, b.center.z);
    } else {
      addBox(bm, b.width, b.height, b.depth, b.color, b.center.x, b.height / 2, b.center.z);
    }
  }

  return drawGroups;
}

// ── props (InstancedMesh per type) ────────────────────────────────────────────

function propGeometry(type: PropType): THREE.BufferGeometry {
  switch (type) {
    case "streetlight": {
      const pole = applyVertexColor(new THREE.CylinderGeometry(0.09, 0.11, 5, 6), "#3a3f47");
      pole.translate(0, 2.5, 0);
      const head = applyVertexColor(new THREE.BoxGeometry(0.7, 0.18, 0.3), "#f2dca0");
      head.translate(0.35, 5, 0);
      return mergeParts([pole, head]);
    }
    case "tree": {
      const trunk = applyVertexColor(new THREE.CylinderGeometry(0.16, 0.22, 2.2, 6), "#6b4a2f");
      trunk.translate(0, 1.1, 0);
      const foliage = applyVertexColor(new THREE.ConeGeometry(1.5, 3.4, 7), "#3f7d43");
      foliage.translate(0, 3.6, 0);
      return mergeParts([trunk, foliage]);
    }
    case "hydrant": {
      const body = applyVertexColor(new THREE.CylinderGeometry(0.18, 0.2, 0.9, 6), "#c0392b");
      body.translate(0, 0.45, 0);
      const cap = applyVertexColor(new THREE.SphereGeometry(0.2, 6, 5), "#c0392b");
      cap.translate(0, 0.95, 0);
      return mergeParts([body, cap]);
    }
    case "bench": {
      const seat = applyVertexColor(new THREE.BoxGeometry(1.6, 0.12, 0.5), "#7a5a3a");
      seat.translate(0, 0.5, 0);
      const back = applyVertexColor(new THREE.BoxGeometry(1.6, 0.5, 0.1), "#7a5a3a");
      back.translate(0, 0.75, -0.2);
      return mergeParts([seat, back]);
    }
    case "trafficlight":
    default: {
      const pole = applyVertexColor(new THREE.CylinderGeometry(0.08, 0.1, 4, 6), "#2c3038");
      pole.translate(0, 2, 0);
      return pole;
    }
  }
}

/** Minimal, dependency-light geometry merge (all parts share position/normal/uv/color). */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  for (const g of parts) {
    const p = g.getAttribute("position");
    const nAttr = g.getAttribute("normal");
    const uvAttr = g.getAttribute("uv");
    const cAttr = g.getAttribute("color");
    const index = g.getIndex();
    const emit = (vi: number) => {
      pos.push(p.getX(vi), p.getY(vi), p.getZ(vi));
      if (nAttr) nrm.push(nAttr.getX(vi), nAttr.getY(vi), nAttr.getZ(vi));
      else nrm.push(0, 1, 0);
      if (uvAttr) uv.push(uvAttr.getX(vi), uvAttr.getY(vi));
      else uv.push(0, 0);
      if (cAttr) col.push(cAttr.getX(vi), cAttr.getY(vi), cAttr.getZ(vi));
      else col.push(1, 1, 1);
    };
    if (index) for (let i = 0; i < index.count; i++) emit(index.getX(i));
    else for (let i = 0; i < p.count; i++) emit(i);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

function materialForProp(type: PropType, mats: CityMaterials): THREE.Material {
  return type === "tree" ? mats.foliage : mats.prop;
}

function buildProps(doc: CityMapDoc, mats: CityMaterials, root: THREE.Group): number {
  let draws = 0;
  const mtx = new THREE.Matrix4();
  for (const group of doc.props) {
    if (group.count === 0) continue;
    const geo = propGeometry(group.type);
    const im = new THREE.InstancedMesh(geo, materialForProp(group.type, mats), group.count);
    im.name = `city:props:${group.type}`;
    im.frustumCulled = false; // instances span the city; skip whole-mesh culling
    for (let i = 0; i < group.count; i++) {
      mtx.fromArray(group.matrices, i * 16);
      im.setMatrixAt(i, mtx);
    }
    im.instanceMatrix.needsUpdate = true;
    root.add(im);
    draws++;
  }
  return draws;
}

// ── landmarks (hero placeholders) ─────────────────────────────────────────────

function buildLandmark(l: Landmark, mats: CityMaterials): THREE.Object3D {
  const g = new THREE.Group();
  g.name = `city:landmark:${l.id}`;
  g.position.set(l.position[0], 0, l.position[2]);
  g.rotation.y = l.rotationY;

  if (l.kind === "tower") {
    const tiers = 4;
    let y = 0;
    for (let t = 0; t < tiers; t++) {
      const frac = 1 - t / (tiers + 1);
      const w = 40 * frac;
      const h = (l.height / tiers) * (0.8 + frac * 0.4);
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mats.landmarkGlass);
      box.position.y = y + h / 2;
      g.add(box);
      y += h;
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.4, 22, 6), mats.landmarkGlass);
    spire.position.y = y + 11;
    g.add(spire);
    const crown = new THREE.Mesh(new THREE.TorusGeometry(6, 0.7, 6, 16), mats.landmarkNeon);
    crown.rotation.x = Math.PI / 2;
    crown.position.y = y;
    g.add(crown);
  } else {
    // Neon Mile: a glowing median + a run of arches.
    const median = new THREE.Mesh(new THREE.BoxGeometry(290, 0.4, 4), mats.landmarkNeon);
    median.position.y = 0.2;
    g.add(median);
    for (let i = -3; i <= 3; i++) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(7, 0.5, 6, 16, Math.PI), mats.landmarkNeon);
      arch.position.set(i * 42, 0, 0);
      g.add(arch);
    }
  }
  return g;
}

// ── orchestration ─────────────────────────────────────────────────────────────

/** Build the entire city into a single group ready to hang off an ECS `three` component. */
export function buildCity(doc: CityMapDoc, mats: CityMaterials): CityBuild {
  const root = new THREE.Group();
  root.name = "santa-vista";

  // Ground slab (visual; the drivable collider is exposed in doc.colliders).
  const w = doc.bounds.max.x - doc.bounds.min.x;
  const d = doc.bounds.max.z - doc.bounds.min.z;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((doc.bounds.min.x + doc.bounds.max.x) / 2, -0.01, (doc.bounds.min.z + doc.bounds.max.z) / 2);
  ground.receiveShadow = true;
  ground.name = "city:ground";
  root.add(ground);

  buildRoads(doc, mats, root);
  const buildingDraws = buildBuildings(doc, mats, root);
  const propDraws = buildProps(doc, mats, root);
  for (const l of doc.landmarks) root.add(buildLandmark(l, mats));

  const dispose = () => {
    root.traverse((obj) => {
      const anyObj = obj as THREE.Mesh & { dispose?: () => void };
      if (anyObj.geometry) anyObj.geometry.dispose();
      if (typeof anyObj.dispose === "function") anyObj.dispose();
    });
    root.clear();
  };

  return {
    root,
    neonMaterials: [mats.buildingNeon, mats.landmarkNeon],
    buildingCount: doc.buildings.length,
    drawGroups: buildingDraws + propDraws + 3 + doc.landmarks.length,
    dispose,
  };
}
