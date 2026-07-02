// Hand-authored INPUT for the generator: map bounds, the 8-district style system scaled to a
// v1 downtown slice (4 districts), arterial spine lines, and hero landmark placements with
// reserved footprints. `generate.ts` fills everything around these procedurally.
//
// District → kit mapping follows the asset catalog (all CC0): Miracle Row = glass towers
// (Quaternius Downtown MegaKit), Costa Dorada = Art-Deco + emissive neon (Quaternius Cyberpunk
// Kit), Calle Sol = low-rise colonial (Kenney City Suburban), The Mint = warehouses/lofts
// (Kenney City Commercial).
import { CITY_HALF } from "./config";
import type { CityBounds, DistrictSpec, Landmark } from "./types";

export interface ArterialLines {
  /** world X coordinates that should be promoted to vertical arterials. */
  x: number[];
  /** world Z coordinates that should be promoted to horizontal arterials. */
  z: number[];
}

export interface DistrictsInput {
  bounds: CityBounds;
  districts: DistrictSpec[];
  arterials: ArterialLines;
  landmarks: Landmark[];
}

/** Build the authored downtown-slice input (deterministic; no RNG needed here). */
export function authorDistricts(): DistrictsInput {
  const H = CITY_HALF;
  const bounds: CityBounds = { min: { x: -H, z: -H }, max: { x: H, z: H } };

  const districts: DistrictSpec[] = [
    {
      key: "miracle_row",
      name: "Miracle Row",
      poly: [
        { x: -H, z: 0 },
        { x: 0, z: 0 },
        { x: 0, z: H },
        { x: -H, z: H },
      ],
      style: {
        floorRange: [10, 30],
        kitSet: "quaternius/downtown-megakit",
        palette: ["#8fa6c4", "#7f93b3", "#9fb2cc", "#6f86a8"],
        emissive: false,
        glass: true,
        density: 0.92,
        zone: "commercial",
      },
    },
    {
      key: "costa_dorada",
      name: "Costa Dorada",
      poly: [
        { x: 0, z: 0 },
        { x: H, z: 0 },
        { x: H, z: H },
        { x: 0, z: H },
      ],
      style: {
        floorRange: [4, 12],
        kitSet: "quaternius/cyberpunk-kit",
        palette: ["#e8b06a", "#d98f5a", "#e6c288", "#c96f8a"],
        emissive: true,
        glass: false,
        density: 0.86,
        zone: "mixed",
      },
    },
    {
      key: "calle_sol",
      name: "Calle Sol",
      poly: [
        { x: -H, z: -H },
        { x: 0, z: -H },
        { x: 0, z: 0 },
        { x: -H, z: 0 },
      ],
      style: {
        floorRange: [1, 3],
        kitSet: "kenney/city-suburban",
        palette: ["#e9dcc3", "#e4c9a1", "#d9b48c", "#f0e2cf"],
        emissive: false,
        glass: false,
        density: 0.72,
        zone: "residential",
      },
    },
    {
      key: "the_mint",
      name: "The Mint",
      poly: [
        { x: 0, z: -H },
        { x: H, z: -H },
        { x: H, z: 0 },
        { x: 0, z: 0 },
      ],
      style: {
        floorRange: [1, 4],
        kitSet: "kenney/city-commercial",
        palette: ["#9a8f83", "#a86e57", "#8d8378", "#b5a48f"],
        emissive: false,
        glass: false,
        density: 0.6,
        zone: "industrial",
      },
    },
  ];

  // Arterial spine: a central cross + the "Neon Mile" avenue through Costa Dorada.
  const arterials: ArterialLines = { x: [0], z: [0, 180] };

  const landmarks: Landmark[] = [
    {
      id: "solaris_tower",
      name: "Solaris Tower",
      kind: "tower",
      footprint: [
        { x: -196, z: 184 },
        { x: -144, z: 184 },
        { x: -144, z: 236 },
        { x: -196, z: 236 },
      ],
      position: [-170, 0, 210],
      rotationY: 0,
      height: 156,
      kitSet: "quaternius/downtown-megakit",
    },
    {
      id: "neon_mile",
      name: "The Neon Mile",
      kind: "strip",
      footprint: [
        { x: 30, z: 176 },
        { x: 320, z: 176 },
        { x: 320, z: 184 },
        { x: 30, z: 184 },
      ],
      position: [175, 0, 180],
      rotationY: 0,
      height: 10,
      kitSet: "quaternius/cyberpunk-kit",
    },
  ];

  return { bounds, districts, arterials, landmarks };
}

/** Landmark kinds that reserve their footprint (blocks under them are dropped). */
export function landmarkReservesFootprint(kind: Landmark["kind"]): boolean {
  return kind === "tower" || kind === "stadium" || kind === "mall";
}
