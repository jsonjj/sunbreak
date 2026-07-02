// Shared THREE materials + procedural (CC0, runtime-generated) textures for the city. Draw calls
// stay low by keeping one material per building TYPE family (office / commercial / residential /
// industrial / neon) — a whole family renders through a single BatchedMesh, and per-district tint
// comes from per-vertex colour on top of the family's facade texture. Nothing is transparent: the
// building mass is always solid/opaque (glass towers read as glass via reflectivity, not opacity).
import * as THREE from "three";

// ── Facade tiling constants (metres) — the mesh sets per-box UVs so windows tile by real size ──
export const FLOOR_M = 3.4; // one storey
export const WINDOW_M = 3.6; // one window bay
const FACADE_CELLS = 4; // windows drawn per texture tile (both axes)
export const FACADE_TILE_W = WINDOW_M * FACADE_CELLS;
export const FACADE_TILE_H = FLOOR_M * FACADE_CELLS;
export const ROOF_M = 48; // roof UV scale → minimal tiling on the top/bottom faces

function makeNoiseTexture(size: number, base: [number, number, number], variance: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const n = (Math.random() - 0.5) * variance;
    data[i * 4 + 0] = Math.max(0, Math.min(255, (base[0] + n) * 255));
    data[i * 4 + 1] = Math.max(0, Math.min(255, (base[1] + n) * 255));
    data[i * 4 + 2] = Math.max(0, Math.min(255, (base[2] + n) * 255));
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  tex.anisotropy = 4;
  return tex;
}

// ── Procedural facade textures (a tiling FACADE_CELLS² window block per building type) ─────────
export type FacadeKind = "office" | "commercial" | "resid" | "industrial" | "neon";

interface FacadePreset {
  wall: string;
  mullion: string;
  glass: string;
  lit: string;
  litChance: number;
  /** window inset as a fraction of the cell. */
  inset: number;
  balcony?: boolean;
  ribs?: boolean;
}

const FACADE_PRESETS: Record<FacadeKind, FacadePreset> = {
  // Downtown glass tower: big cool panes, thin mullions, many lit.
  office: { wall: "#3a4656", mullion: "#2a333f", glass: "#8fb4d8", lit: "#dfeeff", litChance: 0.42, inset: 0.12 },
  // Commercial/shop block: warm walls, medium windows (signage comes from sign quads).
  commercial: { wall: "#7d6f60", mullion: "#594f45", glass: "#c8b48f", lit: "#ffe9b8", litChance: 0.5, inset: 0.2 },
  // Residential low-rise: more wall, small warm windows, a balcony rail per storey.
  resid: { wall: "#c9b79a", mullion: "#9a866a", glass: "#8fa0a6", lit: "#ffe4b0", litChance: 0.3, inset: 0.26, balcony: true },
  // Industrial warehouse: corrugated metal panels with ribs and few small windows.
  industrial: { wall: "#8b8578", mullion: "#6d675c", glass: "#5c6670", lit: "#9fb0bf", litChance: 0.12, inset: 0.3, ribs: true },
  // Neon storefront strip: dark wall, bright glowing windows (rendered unlit → glows).
  neon: { wall: "#221a2b", mullion: "#151019", glass: "#3a2b52", lit: "#ff7ad0", litChance: 0.7, inset: 0.16 },
};

function makeFacadeTexture(kind: FacadeKind): THREE.CanvasTexture {
  const S = 256;
  const cvs = document.createElement("canvas");
  cvs.width = S;
  cvs.height = S;
  const ctx = cvs.getContext("2d");
  if (!ctx) throw new Error("city: 2D canvas context unavailable");
  const p = FACADE_PRESETS[kind];
  ctx.fillStyle = p.wall;
  ctx.fillRect(0, 0, S, S);

  const cell = S / FACADE_CELLS;
  const pad = cell * p.inset;
  for (let r = 0; r < FACADE_CELLS; r++) {
    for (let c = 0; c < FACADE_CELLS; c++) {
      const x = c * cell;
      const y = r * cell;
      // Mullion frame around the pane.
      ctx.fillStyle = p.mullion;
      ctx.fillRect(x + pad * 0.5, y + pad * 0.5, cell - pad, cell - pad);
      // Glass pane (some windows lit for life).
      ctx.fillStyle = Math.random() < p.litChance ? p.lit : p.glass;
      ctx.fillRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2);
      if (p.balcony) {
        ctx.fillStyle = p.mullion;
        ctx.fillRect(x + pad * 0.4, y + cell - pad * 0.9, cell - pad * 0.8, pad * 0.55);
      }
      if (p.ribs) {
        ctx.strokeStyle = "rgba(0,0,0,0.28)";
        ctx.lineWidth = 1;
        for (const rx of [x + cell * 0.33, x + cell * 0.66]) {
          ctx.beginPath();
          ctx.moveTo(rx, y);
          ctx.lineTo(rx, y + cell);
          ctx.stroke();
        }
      }
    }
  }
  const t = new THREE.CanvasTexture(cvs);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** A generic lit storefront sign face (bright board with abstract lettering). */
function makeSignTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 40;
  const cvs = document.createElement("canvas");
  cvs.width = W;
  cvs.height = H;
  const ctx = cvs.getContext("2d");
  if (!ctx) throw new Error("city: 2D canvas context unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#1a1a1f";
  ctx.fillRect(2, 2, W - 4, H - 4);
  // Abstract "lettering": a row of bright blocks.
  ctx.fillStyle = "#ffe08a";
  let x = 8;
  while (x < W - 10) {
    const w = 6 + Math.floor(Math.random() * 12);
    ctx.fillRect(x, 10, w, H - 20);
    x += w + 4;
  }
  const t = new THREE.CanvasTexture(cvs);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export interface CityMaterials {
  asphalt: THREE.MeshStandardMaterial;
  sidewalk: THREE.MeshStandardMaterial;
  ground: THREE.MeshStandardMaterial;
  groundPark: THREE.MeshStandardMaterial;
  groundApron: THREE.MeshStandardMaterial;
  crosswalk: THREE.MeshBasicMaterial;
  /** Building TYPE families (all OPAQUE; glass reads as glass via reflectivity, not transparency). */
  buildingOffice: THREE.MeshStandardMaterial;
  buildingCommercial: THREE.MeshStandardMaterial;
  buildingResid: THREE.MeshStandardMaterial;
  buildingIndustrial: THREE.MeshStandardMaterial;
  buildingNeon: THREE.MeshBasicMaterial;
  prop: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  lamp: THREE.MeshBasicMaterial;
  landmarkGlass: THREE.MeshStandardMaterial;
  landmarkNeon: THREE.MeshBasicMaterial;
  /** Emissive storefront sign face (per-instance tinted via instanceColor). */
  sign: THREE.MeshBasicMaterial;
  /** Acquisition-point marker signs (gun store = red, dealership = blue). */
  signGun: THREE.MeshBasicMaterial;
  signCar: THREE.MeshBasicMaterial;
  dispose: () => void;
}

/** Build the material set once (owns GPU resources → call `dispose()` on teardown). */
export function createCityMaterials(): CityMaterials {
  const asphaltTex = makeNoiseTexture(64, [0.1, 0.1, 0.12], 0.05);
  const concreteTex = makeNoiseTexture(64, [0.52, 0.52, 0.54], 0.08);

  // Flat ground decals are viewed from above only → DoubleSide sidesteps winding pitfalls.
  const asphalt = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const sidewalk = new THREE.MeshStandardMaterial({
    map: concreteTex,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const ground = new THREE.MeshStandardMaterial({ color: "#22262e", roughness: 1, metalness: 0 });
  const groundPark = new THREE.MeshStandardMaterial({ color: "#3f5a30", roughness: 1, metalness: 0 });
  const groundApron = new THREE.MeshStandardMaterial({ color: "#6d7076", roughness: 1, metalness: 0 });
  const crosswalk = new THREE.MeshBasicMaterial({
    color: "#d8dbe0",
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  // Facade textures per building family.
  const officeTex = makeFacadeTexture("office");
  const commTex = makeFacadeTexture("commercial");
  const residTex = makeFacadeTexture("resid");
  const indTex = makeFacadeTexture("industrial");
  const neonTex = makeFacadeTexture("neon");
  const signTex = makeSignTexture();

  // All building families are OPAQUE + FrontSide (boxes are closed, so back-faces are correctly
  // culled and you can never see "inside"). Downtown glass = high metalness + low roughness so it
  // reads as reflective glass WITHOUT any transparency.
  const buildingOffice = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: officeTex,
    roughness: 0.18,
    metalness: 0.6,
  });
  const buildingCommercial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: commTex,
    roughness: 0.7,
    metalness: 0.06,
  });
  const buildingResid = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: residTex,
    roughness: 0.9,
    metalness: 0.02,
  });
  const buildingIndustrial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: indTex,
    roughness: 0.85,
    metalness: 0.18,
  });
  // Neon storefronts glow: unlit basic material so the lit windows read as emissive at night.
  const buildingNeon = new THREE.MeshBasicMaterial({ vertexColors: true, map: neonTex, toneMapped: false });

  const prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.25 });
  const foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const lamp = new THREE.MeshBasicMaterial({ color: "#ffe4a6", toneMapped: false });

  // Landmark glass — OPAQUE reflective (the hero tower must be solid, never see-through).
  const landmarkGlass = new THREE.MeshStandardMaterial({
    color: "#bcdcff",
    roughness: 0.08,
    metalness: 0.72,
  });
  const landmarkNeon = new THREE.MeshBasicMaterial({ color: "#ff5aa8", toneMapped: false });

  const sign = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false, side: THREE.DoubleSide });
  const signGun = new THREE.MeshBasicMaterial({ color: "#ff3b30", toneMapped: false, side: THREE.DoubleSide });
  const signCar = new THREE.MeshBasicMaterial({ color: "#3aa0ff", toneMapped: false, side: THREE.DoubleSide });

  const textures = [asphaltTex, concreteTex, officeTex, commTex, residTex, indTex, neonTex, signTex];
  const materials: THREE.Material[] = [
    asphalt,
    sidewalk,
    ground,
    groundPark,
    groundApron,
    crosswalk,
    buildingOffice,
    buildingCommercial,
    buildingResid,
    buildingIndustrial,
    buildingNeon,
    prop,
    foliage,
    lamp,
    landmarkGlass,
    landmarkNeon,
    sign,
    signGun,
    signCar,
  ];

  return {
    asphalt,
    sidewalk,
    ground,
    groundPark,
    groundApron,
    crosswalk,
    buildingOffice,
    buildingCommercial,
    buildingResid,
    buildingIndustrial,
    buildingNeon,
    prop,
    foliage,
    lamp,
    landmarkGlass,
    landmarkNeon,
    sign,
    signGun,
    signCar,
    dispose: () => {
      for (const t of textures) t.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
