using System.Collections.Generic;
using UnityEngine;

namespace SUNBREAK.World
{
    // ─────────────────────────────────────────────────────────────────────────
    // CANONICAL WORLD MAP for Santa Vista — a direct 1:1 C# port of the web
    // prototype's render/city/geography.ts. Pure data + pure predicates, no scene
    // side-effects. Everything that needs to know "where is land, where is water,
    // which district is here, and where is the edge of the world" reads THIS, so
    // terrain, roads, buildings, foliage and colliders can never disagree.
    //
    // Source convention (preserved): +X east, -X west, +Z south, -Z north, Y up.
    // All 2D coords are (x, z) in metres. This is the reusable blueprint that later
    // slices consume to procedurally generate the island; Slice 0 only ports the data.
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>2D ground-plane point (metres), matching the source's <c>Vec2 = {x, z}</c>.</summary>
    public readonly struct Vec2
    {
        public readonly float x;
        public readonly float z;
        public Vec2(float x, float z) { this.x = x; this.z = z; }
    }

    /// <summary>Axis-aligned world rect [x0,z0] → [x1,z1].</summary>
    public readonly struct AaRect
    {
        public readonly float x0, z0, x1, z1;
        public AaRect(float x0, float z0, float x1, float z1)
        {
            this.x0 = x0; this.z0 = z0; this.x1 = x1; this.z1 = z1;
        }
        public bool Contains(float x, float z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
    }

    public enum Zone { Commercial, Residential, Industrial, Mixed }

    public enum GroundKind { Urban, Park, Apron, None }

    public enum DistrictKey { MiracleRow, CostaDorada, CalleSol, TheMint, NorthPark, Bayfront, Airfield }

    public enum LandmarkKind { Tower, Strip, Stadium, Mall, Pier, Hangar }

    public sealed class DistrictRegion
    {
        public DistrictKey key;
        /// <summary>Original snake_case id from the web blueprint (serialization/round-trip).</summary>
        public string keyId;
        public string name;
        public AaRect rect;
        public Zone zone;
        /// <summary>false = open/no-build (parks, airfield apron): roads only, no lots filled.</summary>
        public bool buildable;
        public GroundKind ground;
        public int floorMin;
        public int floorMax;
        public string kitSet;
        public string[] palette;
        public bool emissive;
        public bool glass;
        public float density;
    }

    public sealed class Landmark
    {
        public string id;
        public string name;
        public LandmarkKind kind;
        public Vec2[] footprint;
        public Vector3 position;
        public float rotationY;
        public float height;
        public string kitSet;
    }

    public sealed class AcquisitionSign
    {
        public string id;
        /// <summary>"gun" or "car".</summary>
        public string kind;
        public float x;
        public float z;
        public string label;
    }

    public readonly struct WaterBody
    {
        public readonly float x, z, radius, floor;
        public WaterBody(float x, float z, float radius, float floor)
        {
            this.x = x; this.z = z; this.radius = radius; this.floor = floor;
        }
    }

    public readonly struct WorldBoundary
    {
        public readonly float minX, maxX, minZ, maxZ, wallHeight, ceilingY, softCeilingY;
        public WorldBoundary(float minX, float maxX, float minZ, float maxZ,
            float wallHeight, float ceilingY, float softCeilingY)
        {
            this.minX = minX; this.maxX = maxX; this.minZ = minZ; this.maxZ = maxZ;
            this.wallHeight = wallHeight; this.ceilingY = ceilingY; this.softCeilingY = softCeilingY;
        }
    }

    public readonly struct SpawnPoint
    {
        public readonly Vector3 position;
        public readonly float yaw;
        public SpawnPoint(Vector3 position, float yaw) { this.position = position; this.yaw = yaw; }
    }

    /// <summary>
    /// The single source of truth for Santa Vista's geography. Static constants + pure
    /// functions ported verbatim from <c>geography.ts</c>.
    /// </summary>
    public static class Geography
    {
        // ── Vertical datum (metres) ──────────────────────────────────────────
        public const float WATER_LEVEL = -1.2f;
        public const float LAND_HEIGHT = -0.25f;
        public const float SHORE_HEIGHT = WATER_LEVEL - 0.2f;

        // ── Horizontal extents (metres, centred on origin) ───────────────────
        /// <summary>Street-grid / district extent (matches source config.CITY_HALF).</summary>
        public const float CITY_HALF = 480f;
        public const float CITY_EXTENT = CITY_HALF;
        /// <summary>Hard world boundary: invisible walls sit here (~542 m coastline + margin).</summary>
        public const float PLAYABLE_HALF = 560f;
        /// <summary>Environment terrain is built out to here (open ocean rendered beyond).</summary>
        public const float BUILT_HALF = 640f;
        public const float FLIGHT_CEILING = 340f;
        public const float FLIGHT_HARD_CEILING = 380f;

        // ── Coastline (island = wobbly rounded rectangle) ────────────────────
        const float COAST_BASE = 542f;
        const float COAST_WOBBLE = 20f;
        /// <summary>Beach band width: terrain ramps from waterline to plateau over this many m.</summary>
        public const float BEACH_WIDTH = 48f;

        // ── Carved water bodies (inside the coastline) ───────────────────────
        public static readonly WaterBody MARINA = new WaterBody(-250f, 495f, 118f, -3.4f);
        public static readonly WaterBody GLADES = new WaterBody(470f, -400f, 122f, LAND_HEIGHT - 0.73f);
        public const float GLADES_LEVEL = LAND_HEIGHT - 0.28f;
        public const float GLADES_FLOOR = GLADES_LEVEL - 0.45f;

        // ── Canonical player spawn (downtown Miracle Row, on land near origin) ─
        public static readonly SpawnPoint PLAYER_SPAWN = new SpawnPoint(new Vector3(0f, 2f, 0f), 0f);

        // ── World boundary (for physics/world-colliders + reports) ───────────
        public static readonly WorldBoundary BOUNDARY = new WorldBoundary(
            -PLAYABLE_HALF, PLAYABLE_HALF, -PLAYABLE_HALF, PLAYABLE_HALF,
            FLIGHT_HARD_CEILING + 60f, FLIGHT_HARD_CEILING, FLIGHT_CEILING);

        static float Clamp01(float v) => v < 0f ? 0f : (v > 1f ? 1f : v);

        static float Smoothstep(float e0, float e1, float x)
        {
            if (Mathf.Approximately(e0, e1)) return x < e0 ? 0f : 1f;
            float t = Clamp01((x - e0) / (e1 - e0));
            return t * t * (3f - 2f * t);
        }

        static float Hypot(float a, float b) => Mathf.Sqrt(a * a + b * b);

        static float CoastWobble(float t, float seed)
        {
            return (Mathf.Sin(t * 0.011f + seed) * 0.6f
                    + Mathf.Sin(t * 0.021f + seed * 2.3f) * 0.3f
                    + Mathf.Sin(t * 0.043f + seed * 5.1f) * 0.1f) * COAST_WOBBLE;
        }

        /// <summary>Signed distance INTO the island from the nearest coast: &gt;0 inland,
        /// ≈0 at the waterline, &lt;0 out at sea.</summary>
        public static float CoastInset(float x, float z)
        {
            float halfX = COAST_BASE + CoastWobble(z, 1.7f);
            float halfZ = COAST_BASE + CoastWobble(x, 4.2f);
            return Mathf.Min(halfX - Mathf.Abs(x), halfZ - Mathf.Abs(z));
        }

        /// <summary>0 outside → 1 inside the Marina basin.</summary>
        public static float MarinaMask(float x, float z)
        {
            float d = Hypot(x - MARINA.x, z - MARINA.z);
            return 1f - Smoothstep(MARINA.radius * 0.7f, MARINA.radius, d);
        }

        /// <summary>0 outside → 1 deep in the Glades marsh (wobbly edge).</summary>
        public static float GladesMask(float x, float z)
        {
            float d = Hypot(x - GLADES.x, z - GLADES.z);
            float edge = GLADES.radius * (0.85f + 0.18f * Mathf.Sin(x * 0.01f + z * 0.013f + 3.1f));
            return 1f - Smoothstep(edge * 0.5f, edge, d);
        }

        /// <summary>Master land/water predicate. TRUE where a genuine water body exists
        /// (open sea beyond the coast, the Marina harbour, or the Glades marsh).</summary>
        public static bool IsWater(float x, float z)
        {
            if (CoastInset(x, z) < BEACH_WIDTH * 0.15f) return true;
            if (MarinaMask(x, z) > 0.5f) return true;
            if (GladesMask(x, z) > 0.5f) return true;
            return false;
        }

        /// <summary>Slightly padded water test for pruning roads/slabs back from the edge.</summary>
        public static bool IsWaterPadded(float x, float z, float pad)
        {
            if (CoastInset(x, z) < BEACH_WIDTH * 0.15f + pad) return true;
            if (Hypot(x - MARINA.x, z - MARINA.z) < MARINA.radius + pad) return true;
            if (Hypot(x - GLADES.x, z - GLADES.z) < GLADES.radius + pad) return true;
            return false;
        }

        // ── Districts (first-match resolution, gaps read as open plazas) ─────
        public static readonly IReadOnlyList<DistrictRegion> DISTRICTS = new List<DistrictRegion>
        {
            new DistrictRegion {
                key = DistrictKey.MiracleRow, keyId = "miracle_row", name = "Miracle Row",
                rect = new AaRect(-170, -170, 170, 150), zone = Zone.Commercial,
                buildable = true, ground = GroundKind.Urban, floorMin = 16, floorMax = 44,
                kitSet = "quaternius/downtown-megakit",
                palette = new[] { "#8fa6c4", "#7f93b3", "#9fb2cc", "#6f86a8", "#aab8cf" },
                emissive = false, glass = true, density = 0.92f,
            },
            new DistrictRegion {
                key = DistrictKey.CostaDorada, keyId = "costa_dorada", name = "Costa Dorada",
                rect = new AaRect(170, -180, 470, 205), zone = Zone.Mixed,
                buildable = true, ground = GroundKind.Urban, floorMin = 5, floorMax = 15,
                kitSet = "quaternius/cyberpunk-kit",
                palette = new[] { "#e8b06a", "#d98f5a", "#e6c288", "#c96f8a", "#f0d29a" },
                emissive = true, glass = false, density = 0.86f,
            },
            new DistrictRegion {
                key = DistrictKey.CalleSol, keyId = "calle_sol", name = "Calle Sol",
                rect = new AaRect(-470, -470, -170, -60), zone = Zone.Residential,
                buildable = true, ground = GroundKind.Urban, floorMin = 1, floorMax = 3,
                kitSet = "kenney/city-suburban",
                palette = new[] { "#e9dcc3", "#e4c9a1", "#d9b48c", "#f0e2cf", "#e7cbb0" },
                emissive = false, glass = false, density = 0.72f,
            },
            new DistrictRegion {
                key = DistrictKey.NorthPark, keyId = "north_park", name = "Vista Park",
                rect = new AaRect(-170, -470, 170, -170), zone = Zone.Mixed,
                buildable = false, ground = GroundKind.Park, floorMin = 1, floorMax = 2,
                kitSet = "kenney/nature",
                palette = new[] { "#8aa06a", "#7c9a52" },
                emissive = false, glass = false, density = 0f,
            },
            new DistrictRegion {
                key = DistrictKey.TheMint, keyId = "the_mint", name = "The Mint",
                rect = new AaRect(-470, 100, -120, 470), zone = Zone.Industrial,
                buildable = true, ground = GroundKind.Urban, floorMin = 1, floorMax = 4,
                kitSet = "kenney/city-commercial",
                palette = new[] { "#9a8f83", "#a86e57", "#8d8378", "#b5a48f", "#7f776b" },
                emissive = false, glass = false, density = 0.6f,
            },
            new DistrictRegion {
                key = DistrictKey.Bayfront, keyId = "bayfront", name = "Bayfront Boardwalk",
                rect = new AaRect(-120, 300, 300, 470), zone = Zone.Mixed,
                buildable = true, ground = GroundKind.Urban, floorMin = 2, floorMax = 7,
                kitSet = "kenney/city-commercial",
                palette = new[] { "#e6d2b0", "#d98f8f", "#8fbcc4", "#e8c07a", "#c98fb0" },
                emissive = true, glass = false, density = 0.62f,
            },
            new DistrictRegion {
                key = DistrictKey.Airfield, keyId = "airfield", name = "Sol Verano Airfield",
                rect = new AaRect(300, 210, 470, 470), zone = Zone.Industrial,
                buildable = false, ground = GroundKind.Apron, floorMin = 1, floorMax = 2,
                kitSet = "kenney/city-commercial",
                palette = new[] { "#b9bcc2", "#9aa0a8" },
                emissive = false, glass = false, density = 0f,
            },
        };

        /// <summary>District covering a world point (first match), or null (open space).</summary>
        public static DistrictRegion DistrictAt(float x, float z)
        {
            for (int i = 0; i < DISTRICTS.Count; i++)
                if (DISTRICTS[i].rect.Contains(x, z)) return DISTRICTS[i];
            return null;
        }

        /// <summary>Ground kind authored for a district key, or None if unknown.</summary>
        public static GroundKind DistrictGround(DistrictKey key)
        {
            for (int i = 0; i < DISTRICTS.Count; i++)
                if (DISTRICTS[i].key == key) return DISTRICTS[i].ground;
            return GroundKind.None;
        }

        /// <summary>Full district record for a key, or null.</summary>
        public static DistrictRegion DistrictByKey(DistrictKey key)
        {
            for (int i = 0; i < DISTRICTS.Count; i++)
                if (DISTRICTS[i].key == key) return DISTRICTS[i];
            return null;
        }

        /// <summary>Ground surface the city should paint at a point (water always wins).</summary>
        public static GroundKind GroundKindAt(float x, float z)
        {
            if (IsWater(x, z)) return GroundKind.None;
            DistrictRegion d = DistrictAt(x, z);
            return d != null ? d.ground : GroundKind.None;
        }

        // ── Acquisition points that get hero SIGNAGE (gun store, car dealership) ─
        public static readonly IReadOnlyList<AcquisitionSign> ACQUISITION_SIGNS = new List<AcquisitionSign>
        {
            new AcquisitionSign { id = "gunstore", kind = "gun", x = 235f, z = 40f, label = "GUNS" },
            new AcquisitionSign { id = "dealership", kind = "car", x = -45f, z = 70f, label = "AUTOS" },
        };

        // ── Landmarks (hero placements) ─────────────────────────────────────
        struct LandmarkAnchor
        {
            public string id, name;
            public LandmarkKind kind;
            public float atX, atZ, halfX, halfZ, rotationY, height;
            public string kitSet;
        }

        static readonly LandmarkAnchor[] LANDMARK_ANCHORS =
        {
            new LandmarkAnchor { id = "solaris_tower", name = "Solaris Tower", kind = LandmarkKind.Tower,
                atX = 0, atZ = -20, halfX = 26, halfZ = 26, rotationY = 0, height = 196,
                kitSet = "quaternius/downtown-megakit" },
            new LandmarkAnchor { id = "neon_mile", name = "The Neon Mile", kind = LandmarkKind.Strip,
                atX = 315, atZ = 30, halfX = 150, halfZ = 5, rotationY = 0, height = 11,
                kitSet = "quaternius/cyberpunk-kit" },
            new LandmarkAnchor { id = "vista_mall", name = "Vista Galleria", kind = LandmarkKind.Mall,
                atX = 380, atZ = 150, halfX = 56, halfZ = 40, rotationY = 0, height = 26,
                kitSet = "kenney/city-commercial" },
            new LandmarkAnchor { id = "estadio_sol", name = "Estadio Sol", kind = LandmarkKind.Stadium,
                atX = 250, atZ = 265, halfX = 70, halfZ = 55, rotationY = 0, height = 40,
                kitSet = "kenney/city-commercial" },
            new LandmarkAnchor { id = "bayfront_pier", name = "Sunset Pier", kind = LandmarkKind.Pier,
                atX = 95, atZ = 520, halfX = 9, halfZ = 70, rotationY = 0, height = 6,
                kitSet = "kenney/city-commercial" },
            new LandmarkAnchor { id = "airfield_tower", name = "Airfield Control", kind = LandmarkKind.Tower,
                atX = 320, atZ = 250, halfX = 8, halfZ = 8, rotationY = 0, height = 34,
                kitSet = "kenney/city-commercial" },
            new LandmarkAnchor { id = "mint_hangar", name = "Customs Hangar", kind = LandmarkKind.Hangar,
                atX = 405, atZ = 380, halfX = 46, halfZ = 32, rotationY = 0, height = 20,
                kitSet = "kenney/city-commercial" },
        };

        /// <summary>Materialise the authored Landmark list (footprint rect from anchor half-extents).</summary>
        public static List<Landmark> BuildLandmarks()
        {
            var list = new List<Landmark>(LANDMARK_ANCHORS.Length);
            foreach (var a in LANDMARK_ANCHORS)
            {
                list.Add(new Landmark
                {
                    id = a.id,
                    name = a.name,
                    kind = a.kind,
                    footprint = new[]
                    {
                        new Vec2(a.atX - a.halfX, a.atZ - a.halfZ),
                        new Vec2(a.atX + a.halfX, a.atZ - a.halfZ),
                        new Vec2(a.atX + a.halfX, a.atZ + a.halfZ),
                        new Vec2(a.atX - a.halfX, a.atZ + a.halfZ),
                    },
                    position = new Vector3(a.atX, 0f, a.atZ),
                    rotationY = a.rotationY,
                    height = a.height,
                    kitSet = a.kitSet,
                });
            }
            return list;
        }
    }
}
