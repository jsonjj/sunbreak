// content/data-format — seed map chunk: Costa Dorada block (Santa Vista, Verano).
//
// One real, streamable MapChunk so World Streaming / Rendering has data day one: a district,
// player + vehicle spawns, POIs linked to a mission and a vendor, instanced props, and a short
// road. Typed with `satisfies MapChunkInput[]`; validated + registered in `registerSeedContent()`.
import type { MapChunkInput } from "../schemas";

export const SEED_MAPS = [
  {
    id: "map_costa-dorada",
    name: "Costa Dorada Block",
    districtId: "district_costa-dorada",
    bounds: { min: [-120, -2, -120], max: [120, 60, 120] },
    districts: [
      {
        id: "district_costa-dorada",
        name: "Costa Dorada",
        polygon: [
          [-120, -120],
          [120, -120],
          [120, 120],
          [-120, 120],
        ],
        music: "radio_costa",
        wantedBias: 0,
        tags: ["beachfront", "tourist"],
      },
    ],
    spawns: [
      {
        id: "spawn_player-main",
        kind: "player",
        transform: { pos: [0, 1, 0], rotDeg: [0, 90, 0] },
        districtId: "district_costa-dorada",
        tags: ["default"],
      },
      {
        id: "spawn_veh-curb",
        kind: "vehicle",
        transform: { pos: [8, 0.5, 4], rotDeg: [0, 0, 0] },
        districtId: "district_costa-dorada",
        vehicleClass: "muscle",
      },
    ],
    pois: [
      {
        id: "poi_intro-garage",
        kind: "mission",
        name: "Doyle's Garage",
        transform: { pos: [14, 0, -10] },
        radius: 5,
        links: { missionId: "mission_intro", npcId: "npc_mac" },
        icon: "garage",
      },
      {
        id: "poi_sol-shop",
        kind: "shop",
        name: "Calle Sol Market",
        transform: { pos: [-18, 0, 12] },
        radius: 4,
        links: { npcId: "npc_sol-vendor" },
        icon: "shop",
      },
    ],
    roadNodes: [
      { id: "node_cd-a", pos: [-100, 0, 0] },
      { id: "node_cd-b", pos: [100, 0, 0] },
    ],
    roads: [
      {
        id: "road_costa-blvd",
        nodeIds: ["node_cd-a", "node_cd-b"],
        points: [
          [-100, 0, 0],
          [0, 0, 0],
          [100, 0, 0],
        ],
        lanes: 4,
        width: 14,
        type: "avenue",
        speedLimit: 60,
        tags: ["main"],
      },
    ],
    props: [
      {
        id: "prop_palm-1",
        model: "props/palm.glb",
        transform: { pos: [6, 0, -6] },
        collider: "cuboid",
        instanceGroup: "palm",
      },
      {
        id: "prop_palm-2",
        model: "props/palm.glb",
        transform: { pos: [-6, 0, -6] },
        collider: "cuboid",
        instanceGroup: "palm",
      },
      {
        id: "prop_bench-1",
        model: "props/bench.glb",
        transform: { pos: [2, 0, 8], rotDeg: [0, 180, 0] },
        collider: "cuboid",
        instanceGroup: "bench",
      },
    ],
  },
] satisfies MapChunkInput[];
