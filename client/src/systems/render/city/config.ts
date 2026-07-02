// Procedural city configuration for Santa Vista (SUNBREAK render/city subsystem).
// Pure constants — no THREE / no framework imports. Tuning lives here so the whole
// pipeline is deterministic from (seed, config).

/** Default deterministic seed. Ship this so every client/peer builds the same city. */
export const CITY_SEED = 0x5a17_a01e; // "santa vista" vibes; any stable int works.

/** Half-extent of the generated core in meters → ~1 km² dense downtown slice. */
export const CITY_HALF = 480;

/** World-streaming tile edge (m). Matches the 128 m streaming grid used by render/streaming. */
export const TILE_SIZE = 128;

/** Base spacing between minor streets (m); jittered per line for organic blocks. */
export const BLOCK_SPACING = 96;
export const BLOCK_SPACING_JITTER = 12;

/** Road widths (m) + lane counts by class. Consumed by traffic to derive lanes. */
export const ROAD_WIDTHS = { arterial: 18, collector: 12, local: 8 } as const;
export const ROAD_LANES = { arterial: 4, collector: 2, local: 2 } as const;

/** Sidewalk band width (m) inset from the road edge before the buildable lot. */
export const SIDEWALK_WIDTH = 3.2;

/** Extra setback (m) from the sidewalk to the building facade. */
export const LOT_SETBACK = 1.4;

/** Parcel area bounds (m²) for recursive OBB lot subdivision. */
export const LOT_MIN_AREA = 220;
export const LOT_MAX_AREA = 1400;

/** Floor height (m) used to turn a floor count into a building height. */
export const FLOOR_HEIGHT = 3.4;

/** Street prop spacing (m) along frontages. */
export const STREETLIGHT_SPACING = 26;
export const TREE_SPACING = 18;

/** Every Nth grid line is promoted to a wider collector; two lines become arterials. */
export const COLLECTOR_EVERY = 3;

/** Draw-budget guard: hard cap on generated buildings (keeps BatchedMesh sane). */
export const MAX_BUILDINGS = 2600;

/** Neon districts get subtle emissive pulsing in the render system. */
export const NEON_PULSE_HZ = 0.35;
