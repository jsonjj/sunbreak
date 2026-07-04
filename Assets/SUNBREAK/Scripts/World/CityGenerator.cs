using System.Collections.Generic;
using UnityEngine;
using SUNBREAK.Vehicles;

namespace SUNBREAK.World
{
    /// <summary>
    /// Runtime generator for the WHOLE island from <see cref="Geography"/>: an island terrain
    /// mesh (coast, beaches, carved marina/marsh), a sea plane, the road grid, all seven
    /// districts filled with their cohesive Kenney kit family, landmarks, sparse street props,
    /// and scattered drivable cars. Everything is generated in <see cref="Generate"/> so the
    /// saved scene stays tiny (just this component + asset refs) — which keeps the repo lean —
    /// while still appearing at runtime AND for editor screenshots (the capture tool calls
    /// Generate() directly). Perf: combined meshes for terrain/roads/sea + GPU-instanced kit
    /// materials keep the whole map to a few hundred draw calls; no occlusion culling (yet).
    /// </summary>
    [DefaultExecutionOrder(-500)]
    public sealed class CityGenerator : MonoBehaviour
    {
        [Header("Kenney models (populated by IslandSceneBuilder)")]
        public GameObject[] midRise;
        public GameObject[] skyscrapers;
        public GameObject[] lowDetail;
        public GameObject[] palms;
        public GameObject streetlight;
        public GameObject carBody;
        public GameObject carWheel;

        [Header("Materials")]
        public Material cityMat;    // Kenney city colormap atlas (buildings)
        public Material carMat;     // Kenney car colormap atlas
        public Material propMat;    // Kenney roads colormap atlas (streetlights)
        public Material terrainMat; // vertex-colour ground (grass/sand/urban)
        public Material roadMat;    // ambientCG asphalt
        public Material seaMat;     // water

        [Header("Tuning")]
        public int terrainCells = 150;
        public float roadSpacing = 64f;
        public float roadHalfWidth = 4.75f;
        public float lotSpacing = 23f;
        public int maxBuildings = 1400;
        public int drivableCars = 10;
        public int seed = 0x5A17;
        public bool generateOnAwake = true;

        const string GenRootName = "~CityGenerated";
        Transform _root;

        readonly List<ArcadeCarController> _cars = new();
        public IReadOnlyList<ArcadeCarController> Cars => _cars;

        void Awake()
        {
            if (generateOnAwake && Application.isPlaying) Generate();
        }

        // ── Orchestration ──────────────────────────────────────────────────────
        [ContextMenu("Generate (preview)")]
        public void Generate()
        {
            Clear();
            _cars.Clear();
            _root = new GameObject(GenRootName).transform;
            _root.SetParent(transform, false);

            var rng = new System.Random(seed);
            BuildTerrain();
            BuildSea();
            BuildRoads();
            BuildDistricts(rng);
            BuildLandmarks(rng);
            BuildStreetProps(rng);
            ScatterVehicles(rng);
        }

        [ContextMenu("Clear")]
        public void Clear()
        {
            var existing = transform.Find(GenRootName);
            if (existing != null) DestroyObj(existing.gameObject);
            _root = null;
        }

        // ── Terrain (heightfield island from Geography) ─────────────────────────
        public static float TerrainHeight(float x, float z)
        {
            float inset = Geography.CoastInset(x, z);
            float h;
            if (inset >= Geography.BEACH_WIDTH) h = Geography.LAND_HEIGHT;
            else if (inset >= 0f)
                h = Mathf.Lerp(Geography.SHORE_HEIGHT, Geography.LAND_HEIGHT, inset / Geography.BEACH_WIDTH);
            else
                h = Mathf.Max(Geography.SHORE_HEIGHT + inset * 0.12f, -8f); // slope into the sea

            float marina = Geography.MarinaMask(x, z);
            if (marina > 0f) h = Mathf.Lerp(h, Geography.MARINA.floor, marina);
            float glades = Geography.GladesMask(x, z);
            if (glades > 0f) h = Mathf.Lerp(h, Geography.GLADES_FLOOR, glades);
            return h;
        }

        static Color32 GroundColor(float x, float z, float height)
        {
            if (height < Geography.WATER_LEVEL + 0.15f) return new Color32(70, 66, 52, 255);   // wet mud/seabed
            float inset = Geography.CoastInset(x, z);
            if (inset < Geography.BEACH_WIDTH * 0.9f) return new Color32(210, 196, 150, 255);   // sand
            var d = Geography.DistrictAt(x, z);
            if (d != null && d.ground == GroundKind.Park) return new Color32(120, 148, 92, 255); // grass
            if (d != null && d.ground == GroundKind.Urban) return new Color32(120, 120, 124, 255); // concrete
            if (d != null && d.ground == GroundKind.Apron) return new Color32(150, 152, 158, 255); // apron
            return new Color32(138, 150, 104, 255); // open scrub
        }

        void BuildTerrain()
        {
            int n = Mathf.Max(16, terrainCells);
            float half = Geography.BUILT_HALF;
            float step = half * 2f / n;
            var mb = new MeshBuilder();
            for (int iz = 0; iz <= n; iz++)
            {
                float z = -half + iz * step;
                for (int ix = 0; ix <= n; ix++)
                {
                    float x = -half + ix * step;
                    float y = TerrainHeight(x, z);
                    mb.AddVertex(new Vector3(x, y, z), Vector3.up, GroundColor(x, z, y),
                        new Vector2(x * 0.02f, z * 0.02f));
                }
            }
            int stride = n + 1;
            for (int iz = 0; iz < n; iz++)
                for (int ix = 0; ix < n; ix++)
                {
                    int a = iz * stride + ix, b = a + 1, c = a + stride, d = c + 1;
                    mb.AddTriangle(a, c, b);
                    mb.AddTriangle(b, c, d);
                }

            var mesh = mb.ToMesh("IslandTerrain");
            mesh.RecalculateNormals();
            var go = NewChild("Terrain");
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = terrainMat;
            go.AddComponent<MeshCollider>().sharedMesh = mesh;
            go.isStatic = true;
        }

        void BuildSea()
        {
            float half = Geography.BUILT_HALF + 60f;
            var mb = new MeshBuilder();
            mb.AddQuadXZ(-half, -half, half, half, Geography.WATER_LEVEL, new Color32(255, 255, 255, 255),
                new Vector2(half * 0.05f, half * 0.05f));
            var go = NewChild("Sea");
            go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh("Sea");
            go.AddComponent<MeshRenderer>().sharedMaterial = seaMat;
            go.isStatic = true;
        }

        // ── Roads (grid, clipped off the water, one combined mesh) ───────────────
        void BuildRoads()
        {
            var mb = new MeshBuilder();
            float y = Geography.LAND_HEIGHT + 0.04f;
            int k = Mathf.CeilToInt(Geography.CITY_HALF / roadSpacing);
            var white = new Color32(255, 255, 255, 255);

            for (int i = -k; i <= k; i++)
            {
                float line = i * roadSpacing;
                // road along X at z=line
                for (float x = -Geography.CITY_HALF; x < Geography.CITY_HALF; x += roadSpacing)
                {
                    float mx = x + roadSpacing * 0.5f;
                    if (Geography.IsWaterPadded(mx, line, roadHalfWidth + 2f)) continue;
                    mb.AddQuadXZ(x, line - roadHalfWidth, x + roadSpacing, line + roadHalfWidth, y, white,
                        new Vector2(roadSpacing / 5f, roadHalfWidth * 2f / 5f));
                }
                // road along Z at x=line
                for (float z = -Geography.CITY_HALF; z < Geography.CITY_HALF; z += roadSpacing)
                {
                    float mz = z + roadSpacing * 0.5f;
                    if (Geography.IsWaterPadded(line, mz, roadHalfWidth + 2f)) continue;
                    mb.AddQuadXZ(line - roadHalfWidth, z, line + roadHalfWidth, z + roadSpacing, y, white,
                        new Vector2(roadHalfWidth * 2f / 5f, roadSpacing / 5f));
                }
            }

            var go = NewChild("Roads");
            go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh("Roads");
            go.AddComponent<MeshRenderer>().sharedMaterial = roadMat;
            go.isStatic = true;
        }

        bool OnRoad(float x, float z, float margin)
        {
            float dx = Mathf.Abs(x - Mathf.Round(x / roadSpacing) * roadSpacing);
            float dz = Mathf.Abs(z - Mathf.Round(z / roadSpacing) * roadSpacing);
            return dx < roadHalfWidth + margin || dz < roadHalfWidth + margin;
        }

        float RoadFacingYaw(float x, float z)
        {
            float dx = x - Mathf.Round(x / roadSpacing) * roadSpacing;
            float dz = z - Mathf.Round(z / roadSpacing) * roadSpacing;
            if (Mathf.Abs(dx) < Mathf.Abs(dz)) return dx >= 0f ? -90f : 90f; // face nearest vertical road
            return dz >= 0f ? 180f : 0f;                                     // face nearest horizontal road
        }

        // ── Districts ────────────────────────────────────────────────────────────
        void BuildDistricts(System.Random rng)
        {
            var group = NewChild("Buildings").transform;
            int count = 0;
            foreach (var d in Geography.DISTRICTS)
            {
                if (d.ground == GroundKind.Park) { FillPark(d, rng); continue; }
                if (!d.buildable || d.ground != GroundKind.Urban) continue;

                for (float x = d.rect.x0 + lotSpacing * 0.5f; x < d.rect.x1; x += lotSpacing)
                    for (float z = d.rect.z0 + lotSpacing * 0.5f; z < d.rect.z1; z += lotSpacing)
                    {
                        if (count >= maxBuildings) return;
                        float jx = x + (float)(rng.NextDouble() * 6 - 3);
                        float jz = z + (float)(rng.NextDouble() * 6 - 3);
                        if (Geography.DistrictAt(jx, jz) != d) continue;
                        if (Geography.IsWaterPadded(jx, jz, 8f)) continue;
                        if (OnRoad(jx, jz, 3.5f)) continue;
                        if (rng.NextDouble() > d.density) continue;

                        int floors = Random(rng, d.floorMin, d.floorMax);
                        float height = floors * 3.3f;
                        var model = PickBuilding(height, rng);
                        if (model == null) continue;
                        PlaceBuilding(model, jx, jz, height, RoadFacingYaw(jx, jz), cityMat, group);
                        count++;
                    }
            }
        }

        GameObject PickBuilding(float height, System.Random rng)
        {
            if (height > 34f && skyscrapers != null && skyscrapers.Length > 0)
                return skyscrapers[rng.Next(skyscrapers.Length)];
            if (height < 13f && lowDetail != null && lowDetail.Length > 0)
                return lowDetail[rng.Next(lowDetail.Length)];
            if (midRise != null && midRise.Length > 0) return midRise[rng.Next(midRise.Length)];
            return (lowDetail != null && lowDetail.Length > 0) ? lowDetail[rng.Next(lowDetail.Length)] : null;
        }

        void FillPark(DistrictRegion d, System.Random rng)
        {
            if (palms == null || palms.Length == 0) return;
            var group = NewChild("Park").transform;
            for (float x = d.rect.x0 + 12; x < d.rect.x1; x += 22f)
                for (float z = d.rect.z0 + 12; z < d.rect.z1; z += 22f)
                {
                    if (rng.NextDouble() > 0.5) continue;
                    float jx = x + (float)(rng.NextDouble() * 12 - 6);
                    float jz = z + (float)(rng.NextDouble() * 12 - 6);
                    if (Geography.IsWaterPadded(jx, jz, 4f) || OnRoad(jx, jz, 3f)) continue;
                    var tree = palms[rng.Next(palms.Length)];
                    var go = Instantiate(tree, group);
                    FitByHeight(go, jx, jz, 6f + (float)rng.NextDouble() * 4f, (float)rng.NextDouble() * 360f);
                    AddTrunkCapsule(go);
                }
        }

        // ── Landmarks (hero placements from Geography) ───────────────────────────
        void BuildLandmarks(System.Random rng)
        {
            var group = NewChild("Landmarks").transform;
            foreach (var lm in Geography.BuildLandmarks())
            {
                float w = 0f, dpt = 0f;
                if (lm.footprint != null && lm.footprint.Length >= 3)
                {
                    w = Mathf.Abs(lm.footprint[1].x - lm.footprint[0].x);
                    dpt = Mathf.Abs(lm.footprint[2].z - lm.footprint[1].z);
                }
                GameObject model = lm.kind switch
                {
                    LandmarkKind.Tower => Pick(skyscrapers, rng),
                    LandmarkKind.Strip => Pick(midRise, rng),
                    _ => Pick(lowDetail, rng),
                };
                if (model == null) continue;
                var go = Instantiate(model, group);
                go.name = "Landmark_" + lm.id;
                // Fit to footprint width + landmark height, on the terrain.
                var b = FitByHeight(go, lm.position.x, lm.position.z, Mathf.Max(8f, lm.height), lm.rotationY);
                Paint(go, cityMat);
                float targetW = Mathf.Max(w, dpt);
                if (targetW > 4f && b.size.x > 0.1f)
                {
                    float extra = Mathf.Clamp(targetW / b.size.x, 0.6f, 3.5f);
                    go.transform.localScale = new Vector3(go.transform.localScale.x * extra,
                        go.transform.localScale.y, go.transform.localScale.z * extra);
                    Reseat(go, lm.position.x, lm.position.z);
                }
                AddSolidBox(go); // landmarks are solid too (the tester walked through these towers)
            }
        }

        // ── Street props (sparse poles + no per-lamp lights for perf) ────────────
        void BuildStreetProps(System.Random rng)
        {
            if (streetlight == null) return;
            var group = NewChild("Props").transform;
            int k = Mathf.CeilToInt(Geography.CITY_HALF / roadSpacing);
            for (int i = -k; i <= k; i += 1)
            {
                float line = i * roadSpacing;
                for (float t = -Geography.CITY_HALF + 30f; t < Geography.CITY_HALF; t += 58f)
                {
                    TryPole(group, t, line + roadHalfWidth + 1.2f, 90f);
                    TryPole(group, line + roadHalfWidth + 1.2f, t, 0f);
                }
            }
        }

        void TryPole(Transform group, float x, float z, float yaw)
        {
            if (Geography.IsWaterPadded(x, z, 3f)) return;
            if (Geography.DistrictAt(x, z) == null) return;
            var go = Instantiate(streetlight, group);
            FitByHeight(go, x, z, 7f, yaw);
            Paint(go, propMat);
            AddSolidBox(go);
        }

        // ── Vehicles (drivable, scattered on roads) ──────────────────────────────
        void ScatterVehicles(System.Random rng)
        {
            var group = NewChild("Vehicles").transform;
            // One right by the spawn on the road, the rest on road lanes across districts (never in a
            // building footprint — cars only go where OnRoad() is true, which the districts skip).
            SpawnCar(new Vector3(6f, 0f, 2.5f), 90f, group);

            int placed = 1, tries = 0;
            while (placed < drivableCars && tries++ < 600)
            {
                if (!TryRoadSpot(rng, out Vector3 pos, out float yaw)) continue;
                SpawnCar(pos, yaw, group);
                placed++;
            }
        }

        /// <summary>A point on a road lane (clear of water + building footprints), with a heading
        /// that runs along the road.</summary>
        bool TryRoadSpot(System.Random rng, out Vector3 pos, out float yaw)
        {
            pos = Vector3.zero; yaw = 0f;
            int k = Mathf.CeilToInt(Geography.CITY_HALF / roadSpacing);
            bool alongX = rng.Next(2) == 0;
            float line = (rng.Next(2 * k + 1) - k) * roadSpacing;
            float along = (float)(rng.NextDouble() * 2 - 1) * (Geography.CITY_HALF - 30f);
            const float lane = 2.1f;
            if (alongX) { pos = new Vector3(along, 0f, line - lane); yaw = rng.Next(2) == 0 ? 90f : -90f; }
            else { pos = new Vector3(line + lane, 0f, along); yaw = rng.Next(2) == 0 ? 0f : 180f; }
            if (Geography.IsWaterPadded(pos.x, pos.z, 6f) || Geography.DistrictAt(pos.x, pos.z) == null) return false;
            return true;
        }

        /// <summary>
        /// Build a Kenney car visual (body + 4 fitted wheels) parked on the terrain, optionally
        /// tinted. Reused by the drivable car, cop cars, and traffic. All transforms are guarded
        /// finite/in-range so a degenerate model can never produce an out-of-bounds position.
        /// </summary>
        public GameObject BuildCarVisual(Vector3 groundPos, float yaw, Color tint, out Transform[] wheels, out Bounds bounds)
        {
            wheels = System.Array.Empty<Transform>();
            bounds = new Bounds(Vector3.zero, new Vector3(1.8f, 1.2f, 4.2f));
            if (carBody == null) return null;

            var root = new GameObject("Car").transform;
            root.SetParent(_root, false);

            var body = Instantiate(carBody, root);
            body.transform.localScale = Vector3.one;
            body.transform.localPosition = Vector3.zero;
            Bounds b = CombinedBounds(body);
            float natLen = Mathf.Max(b.size.x, b.size.z, 0.05f);
            float s = Mathf.Clamp(4.2f / natLen, 0.05f, 40f);
            body.transform.localScale = Vector3.one * s;
            b = CombinedBounds(body);
            body.transform.position += Safe(new Vector3(-b.center.x, -b.min.y, -b.center.z));
            b = CombinedBounds(body);
            Paint(body, carMat);

            float halfTrack = b.size.x * 0.5f * 0.92f;
            float frontZ = b.size.z * 0.5f * 0.66f;
            float radius = Mathf.Clamp(b.size.y * 0.28f, 0.28f, 0.55f);
            var wh = new Transform[4];
            (float x, float z)[] wp = { (-halfTrack, frontZ), (halfTrack, frontZ), (-halfTrack, -frontZ), (halfTrack, -frontZ) };
            for (int i = 0; i < 4; i++)
            {
                var pivot = new GameObject("Wheel" + i).transform;
                pivot.SetParent(root, false);
                pivot.localPosition = Safe(new Vector3(wp[i].x, radius, wp[i].z));
                if (carWheel != null)
                {
                    var w = Instantiate(carWheel, pivot);
                    w.transform.localScale = Vector3.one;
                    Bounds wb = CombinedBounds(w);
                    float wl = Mathf.Max(wb.size.x, wb.size.y, wb.size.z, 0.05f);
                    w.transform.localScale = Vector3.one * Mathf.Clamp(radius * 2f / wl, 0.02f, 20f);
                    wb = CombinedBounds(w);
                    w.transform.position += Safe(pivot.position - wb.center);
                    if (wp[i].x > 0f) w.transform.localRotation = Quaternion.Euler(0f, 180f, 0f);
                    Paint(w, carMat);
                }
                wh[i] = pivot;
            }
            if (tint != Color.white) TintInstance(root.gameObject, tint);
            root.gameObject.AddComponent<CarLights>(); // headlights at night
            root.gameObject.AddComponent<SUNBREAK.Audio.EngineAudio>(); // engine tone, distance-gated

            float groundY = TerrainHeight(groundPos.x, groundPos.z);
            root.SetPositionAndRotation(Safe(new Vector3(groundPos.x, groundY + 0.4f, groundPos.z)), Quaternion.Euler(0f, yaw, 0f));

            // All cars live on the vehicle layer so raycast wheels + traffic sensors ignore vehicles.
            SetLayerRecursive(root.gameObject, CarLayer);

            wheels = wh;
            bounds = b;
            return root.gameObject;
        }

        public ArcadeCarController SpawnCar(Vector3 groundPos, float yaw, Transform parent)
        {
            var go = BuildCarVisual(groundPos, yaw, Color.white, out var wheels, out var b);
            if (go == null) return null;
            if (parent != null) go.transform.SetParent(parent, true);

            var rb = go.AddComponent<Rigidbody>();
            // Chassis box lifted ABOVE the wheel-contact plane so the car rides on its raycast wheels
            // (if the box rests on the ground the springs never load → zero grip → the car can't drive).
            float wheelRadius = Mathf.Clamp(b.size.y * 0.28f, 0.28f, 0.55f);
            float lift = wheelRadius + 0.12f;
            var box = go.AddComponent<BoxCollider>();
            box.center = new Vector3(0f, lift + b.size.y * 0.5f, 0f);
            box.size = new Vector3(b.size.x * 0.9f, b.size.y, b.size.z * 0.98f);
            var ctrl = go.AddComponent<ArcadeCarController>();
            ctrl.groundMask = ~(1 << CarLayer); // wheels never ray-hit any vehicle
            var cfg = VehicleConfig.Sedan();
            float rest = cfg.wheels.Length > 0 ? cfg.wheels[0].suspensionRestLength : 0.32f;
            float radius = Mathf.Clamp(b.size.y * 0.28f, 0.28f, 0.55f);
            float halfTrack = b.size.x * 0.5f * 0.92f, frontZ = b.size.z * 0.5f * 0.66f;
            (float x, float z)[] wp = { (-halfTrack, frontZ), (halfTrack, frontZ), (-halfTrack, -frontZ), (halfTrack, -frontZ) };
            for (int i = 0; i < cfg.wheels.Length && i < 4; i++)
            {
                cfg.wheels[i].position = new Vector3(wp[i].x, radius + rest, wp[i].z);
                cfg.wheels[i].radius = radius;
            }
            cfg.chassisHalfExtents = new Vector3(b.size.x * 0.5f, b.size.y * 0.5f, b.size.z * 0.5f);
            ctrl.config = cfg;
            ctrl.wheelVisuals = wheels;
            ctrl.controlEnabled = false; // parked until the player enters (F)
            rb.mass = cfg.mass;
            _cars.Add(ctrl);
            return ctrl;
        }

        static readonly int BaseColorProp = Shader.PropertyToID("_BaseColor");
        static void TintInstance(GameObject go, Color tint)
        {
            var mpb = new MaterialPropertyBlock();
            foreach (var r in go.GetComponentsInChildren<MeshRenderer>())
            {
                r.GetPropertyBlock(mpb);
                mpb.SetColor(BaseColorProp, tint);
                r.SetPropertyBlock(mpb);
            }
        }

        // ── Placement helpers (runtime, no AssetDatabase) ────────────────────────
        GameObject PlaceBuilding(GameObject model, float x, float z, float height, float yaw, Material mat, Transform parent)
        {
            var go = Instantiate(model, parent);
            FitByHeight(go, x, z, height, yaw);
            Paint(go, mat);
            AddSolidBox(go);
            return go;
        }

        Bounds FitByHeight(GameObject go, float x, float z, float targetHeight, float yaw)
        {
            go.transform.SetPositionAndRotation(Vector3.zero, Quaternion.Euler(0f, yaw, 0f));
            go.transform.localScale = Vector3.one;
            Bounds b = CombinedBounds(go);
            float h = Mathf.Max(0.05f, b.size.y);              // guard degenerate bounds
            float scale = Mathf.Clamp(targetHeight / h, 0.02f, 300f);
            go.transform.localScale = Vector3.one * scale;
            Reseat(go, x, z);
            return CombinedBounds(go);
        }

        void Reseat(GameObject go, float x, float z)
        {
            Bounds b = CombinedBounds(go);
            float groundY = TerrainHeight(x, z);
            Vector3 p = go.transform.position;
            p.x += x - b.center.x;
            p.z += z - b.center.z;
            p.y += groundY - b.min.y;
            go.transform.position = Safe(p);
        }

        // ── Finite/in-range guards (a degenerate model can never crash level0 load) ──
        const float PosLimit = 5000f;
        static bool IsFinite(Vector3 v) =>
            !(float.IsNaN(v.x) || float.IsInfinity(v.x) || float.IsNaN(v.y) || float.IsInfinity(v.y)
              || float.IsNaN(v.z) || float.IsInfinity(v.z));
        static Vector3 Safe(Vector3 v)
        {
            if (!IsFinite(v)) return Vector3.zero;
            return new Vector3(Mathf.Clamp(v.x, -PosLimit, PosLimit), Mathf.Clamp(v.y, -PosLimit, PosLimit),
                Mathf.Clamp(v.z, -PosLimit, PosLimit));
        }

        static Bounds CombinedBounds(GameObject go)
        {
            var rends = go.GetComponentsInChildren<Renderer>();
            bool any = false;
            Bounds b = new Bounds(Safe(go.transform.position), Vector3.one);
            foreach (var r in rends)
            {
                Bounds rb = r.bounds;
                if (!IsFinite(rb.center) || !IsFinite(rb.size)) continue; // skip degenerate/NaN
                if (!any) { b = rb; any = true; } else b.Encapsulate(rb);
            }
            if (!any || !IsFinite(b.center) || !IsFinite(b.size) || b.size.y < 1e-4f)
                return new Bounds(Safe(go.transform.position), new Vector3(1f, 1.8f, 1f));
            return b;
        }

        static void Paint(GameObject go, Material mat)
        {
            if (mat == null) return;
            foreach (var mr in go.GetComponentsInChildren<MeshRenderer>(true))
            {
                var mf = mr.GetComponent<MeshFilter>();
                int subs = mf != null && mf.sharedMesh != null ? Mathf.Max(1, mf.sharedMesh.subMeshCount) : 1;
                if (subs == 1) { mr.sharedMaterial = mat; continue; }
                var arr = new Material[subs];
                for (int i = 0; i < subs; i++) arr[i] = mat;
                mr.sharedMaterials = arr;
            }
        }

        /// <summary>Layer for all cars so wheel/traffic rays never hit vehicles (self or others).</summary>
        public const int CarLayer = 8;

        /// <summary>Solid, correctly-oriented box collider from the object's LOCAL mesh bounds (so it
        /// stays right under any yaw/scale — the old world-AABB math produced loose/wrong boxes).</summary>
        static void AddSolidBox(GameObject go)
        {
            var mfs = go.GetComponentsInChildren<MeshFilter>();
            bool any = false; Bounds local = default;
            Matrix4x4 w2l = go.transform.worldToLocalMatrix;
            foreach (var mf in mfs)
            {
                if (mf.sharedMesh == null) continue;
                Bounds mb = mf.sharedMesh.bounds;
                if (!IsFinite(mb.center) || !IsFinite(mb.size)) continue;
                Bounds tb = TransformBounds(w2l * mf.transform.localToWorldMatrix, mb);
                if (!any) { local = tb; any = true; } else local.Encapsulate(tb);
            }
            if (!any || local.size.y < 1e-3f) return;
            var bc = go.AddComponent<BoxCollider>();
            bc.center = local.center;
            bc.size = local.size;
        }

        static Bounds TransformBounds(Matrix4x4 m, Bounds b)
        {
            Vector3 c = m.MultiplyPoint3x4(b.center);
            Vector3 e = b.extents;
            Vector3 ax = m.MultiplyVector(new Vector3(e.x, 0, 0));
            Vector3 ay = m.MultiplyVector(new Vector3(0, e.y, 0));
            Vector3 az = m.MultiplyVector(new Vector3(0, 0, e.z));
            Vector3 ext = new Vector3(
                Mathf.Abs(ax.x) + Mathf.Abs(ay.x) + Mathf.Abs(az.x),
                Mathf.Abs(ax.y) + Mathf.Abs(ay.y) + Mathf.Abs(az.y),
                Mathf.Abs(ax.z) + Mathf.Abs(ay.z) + Mathf.Abs(az.z));
            return new Bounds(c, ext * 2f);
        }

        /// <summary>Thin capsule trunk collider for a tree/palm (avoids a wide frond box).</summary>
        static void AddTrunkCapsule(GameObject go)
        {
            Bounds b = CombinedBounds(go);
            var cap = go.AddComponent<CapsuleCollider>();
            cap.direction = 1; // Y
            cap.center = go.transform.InverseTransformPoint(new Vector3(b.center.x, b.min.y + b.size.y * 0.5f, b.center.z));
            Vector3 ls = go.transform.lossyScale;
            cap.height = b.size.y / Mathf.Max(1e-4f, ls.y);
            cap.radius = 0.35f / Mathf.Max(1e-4f, Mathf.Max(ls.x, ls.z));
        }

        public static void SetLayerRecursive(GameObject go, int layer)
        {
            go.layer = layer;
            foreach (Transform t in go.transform) SetLayerRecursive(t.gameObject, layer);
        }

        GameObject NewChild(string name)
        {
            var go = new GameObject(name);
            go.transform.SetParent(_root, false);
            return go;
        }

        static GameObject Pick(GameObject[] arr, System.Random rng) =>
            arr != null && arr.Length > 0 ? arr[rng.Next(arr.Length)] : null;

        static int Random(System.Random rng, int a, int b) => a >= b ? a : a + rng.Next(b - a + 1);

        static void DestroyObj(Object o)
        {
            if (Application.isPlaying) Destroy(o); else DestroyImmediate(o);
        }
    }
}
