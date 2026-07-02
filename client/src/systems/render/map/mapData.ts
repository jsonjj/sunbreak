// Authored v1 vector city — "Santa Vista" (state of Verano).
//
// Canon geography (Costa Dorada, Neon Mile, Solaris, Puerto Vista, Miracle Row) laid out on the
// Three.js X/Z ground plane, centred on the origin so the v0 spawn (0, 6) sits on Solaris Avenue.
// Generated as a connected 100 m lattice: vertical + horizontal roads share exact vertices at every
// crossing, so `buildRoadGraph` fuses them into a routable grid. The far south (z > 500) is ocean.
import { MAP_VERSION } from "./mapConstants";
import type { Area, MapData, Poi, Road, Vec2 } from "./mapTypes";

const v = (x: number, z: number): Vec2 => ({ x, z });

const GRID = 100;
const X_MIN = -600;
const X_MAX = 600;
const Z_MIN = -600;
const COAST_Z = 500; // land stops here; ocean below

const NAMED_AVENUES: Record<number, string> = {
  [-400]: "Dorado Drive",
  [-200]: "West Verano Ave",
  [0]: "Solaris Avenue",
  [200]: "Alameda Way",
  [400]: "Puerto Boulevard",
};
const NAMED_STREETS: Record<number, string> = {
  [-400]: "Marina Row",
  [-200]: "Miracle Row",
  [0]: "Verano Boulevard",
  [200]: "Sundown Street",
  [400]: "Harbor Line",
};

function buildRoads(): Road[] {
  const roads: Road[] = [];
  let id = 1;

  // Vertical roads (constant x) — run north/south, stopping at the coast.
  for (let x = X_MIN; x <= X_MAX; x += GRID) {
    const pts: Vec2[] = [];
    for (let z = Z_MIN; z <= COAST_Z; z += GRID) pts.push(v(x, z));
    const isEdge = x === X_MIN || x === X_MAX;
    const cls = isEdge ? "highway" : x % 200 === 0 ? "arterial" : "street";
    roads.push({ id: id++, cls, pts, ...(NAMED_AVENUES[x] ? { name: NAMED_AVENUES[x] } : {}) });
  }

  // Horizontal roads (constant z) — run east/west across the full width.
  for (let z = Z_MIN; z <= COAST_Z; z += GRID) {
    const pts: Vec2[] = [];
    for (let x = X_MIN; x <= X_MAX; x += GRID) pts.push(v(x, z));
    const isNorthEdge = z === Z_MIN;
    const isCoast = z === COAST_Z;
    const cls = isNorthEdge ? "highway" : isCoast ? "arterial" : z % 200 === 0 ? "arterial" : "street";
    const name = isCoast ? "Costa Dorada Boulevard" : NAMED_STREETS[z];
    roads.push({ id: id++, cls, pts, ...(name ? { name } : {}) });
  }

  // Neon Mile — SW→NE diagonal through grid crossings (adds diagonal graph edges).
  {
    const pts: Vec2[] = [];
    for (let k = -4; k <= 4; k++) pts.push(v(k * GRID, k * GRID));
    roads.push({ id: id++, cls: "arterial", name: "Neon Mile", pts });
  }
  // Miracle Mile — NW→SE diagonal counterpart.
  {
    const pts: Vec2[] = [];
    for (let k = -4; k <= 4; k++) pts.push(v(k * GRID, -k * GRID));
    roads.push({ id: id++, cls: "arterial", name: "Miracle Mile", pts });
  }

  return roads;
}

function buildAreas(): Area[] {
  let id = 1;
  const areas: Area[] = [];

  // Ocean (Bahía del Sol) across the southern edge.
  areas.push({
    id: id++,
    kind: "water",
    name: "Bahía del Sol",
    poly: [v(-700, COAST_Z), v(700, COAST_Z), v(700, 700), v(-700, 700)],
    label: v(-330, 615),
  });
  // Costa Dorada beachfront.
  areas.push({
    id: id++,
    kind: "beach",
    name: "Costa Dorada",
    poly: [v(-600, 455), v(600, 455), v(600, COAST_Z), v(-600, COAST_Z)],
    label: v(300, 478),
  });

  // Districts (subtle fills + labels).
  areas.push({
    id: id++,
    kind: "district",
    name: "Solaris Core",
    poly: [v(-150, -160), v(160, -160), v(160, 150), v(-150, 150)],
    label: v(5, -30),
  });
  areas.push({
    id: id++,
    kind: "district",
    name: "Miracle Row",
    poly: [v(-560, -170), v(-170, -170), v(-170, 160), v(-560, 160)],
    label: v(-365, 5),
  });
  areas.push({
    id: id++,
    kind: "district",
    name: "Neon Mile",
    poly: [v(150, 150), v(430, 150), v(430, 430), v(150, 430)],
    label: v(300, 300),
  });
  areas.push({
    id: id++,
    kind: "district",
    name: "Puerto Vista",
    poly: [v(200, 300), v(560, 300), v(560, 450), v(200, 450)],
    label: v(390, 375),
  });
  areas.push({
    id: id++,
    kind: "district",
    name: "Alturas",
    poly: [v(-560, -560), v(-170, -560), v(-170, -200), v(-560, -200)],
    label: v(-365, -380),
  });

  // Alameda Park (green space).
  areas.push({
    id: id++,
    kind: "park",
    name: "Alameda Park",
    poly: [v(150, -450), v(360, -450), v(360, -240), v(150, -240)],
    label: v(255, -345),
  });

  return areas;
}

function buildPois(): Poi[] {
  let id = 1;
  const p = (type: Poi["type"], name: string, at: Vec2): Poi => ({ id: id++, type, name, at });
  return [
    p("safehouse", "Casa Verano", v(0, 90)),
    p("property", "Solaris Tower", v(0, 0)),
    p("gas", "SunFuel", v(200, 10)),
    p("gas", "SunFuel West", v(-300, 210)),
    p("hospital", "Verano General", v(-210, -190)),
    p("garage", "Lugnut Garage", v(110, -110)),
    p("shop", "Mercado Central", v(-110, 110)),
    p("shop", "Ammu-Vista", v(300, -300)),
    p("activity", "Neon Arcade", v(250, 250)),
    p("fasttravel", "Terminal Norte", v(0, -600)),
    p("fasttravel", "Puerto Vista Docks", v(400, 400)),
    p("fasttravel", "Costa Dorada Pier", v(0, 470)),
    p("collectible", "Sol Fragment", v(-500, 400)),
  ];
}

/** The v1 Santa Vista basemap. Bounds cover a 1400 m square centred on the origin. */
export const SANTA_VISTA_MAP: MapData = {
  version: MAP_VERSION,
  name: "Santa Vista",
  bounds: { min: v(-700, -700), max: v(700, 700) },
  roads: buildRoads(),
  areas: buildAreas(),
  pois: buildPois(),
};
