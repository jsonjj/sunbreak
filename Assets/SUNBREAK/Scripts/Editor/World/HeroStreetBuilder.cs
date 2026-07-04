using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using Unity.Cinemachine;
using SUNBREAK.BuildTools;
using SUNBREAK.Cameras;
using SUNBREAK.EditorTools.Characters;
using SUNBREAK.EditorTools.Kits;
using SUNBREAK.Player;
using SUNBREAK.Vehicles;

namespace SUNBREAK.EditorTools.World
{
    /// <summary>
    /// Slice 1 look-lock generator. Builds ONE polished, cohesive downtown hero street
    /// (a hand-picked Miracle Row block) entirely in code: an ambientCG PBR road channel
    /// framed by raised paving-stone sidewalks, lined with a CONSISTENT set of Kenney
    /// commercial buildings + a skyscraper vista, warm streetlights (real point lights +
    /// emissive glow for bloom), coastal palms, parked cars, a drivable Kenney sedan wired
    /// to the ported arcade handling, a Cinemachine third-person player, and the full
    /// HDRI + golden-hour + post look. Idempotent. Run headlessly via
    /// <c>-executeMethod SUNBREAK.EditorTools.World.HeroStreetBuilder.Build</c>.
    /// </summary>
    public static class HeroStreetBuilder
    {
        // ── Street geometry (metres; street runs along +Z/−Z, centreline at x=0) ──
        const float RoadHalf = 6f;          // asphalt channel half-width
        const float SidewalkWidth = 4.6f;
        const float SidewalkTop = 0.16f;    // kerb height
        const float BuildingFront = 11.2f;  // street-facing edge of the building lots
        const float StreetZMin = -96f;
        const float StreetZMax = 108f;
        const float GroundHalf = 150f;
        // Kenney building fronts face +Z; add 180 here if a re-run shows them backwards.
        const float FrontOffset = 0f;

        static readonly Color Warm = new Color(1f, 0.86f, 0.66f);

        // ── Entry points ──────────────────────────────────────────────────────
        public static void Build()
        {
            try
            {
                BuildInternal();
                Debug.Log("SUNBREAK_HERO_OK: " + SunbreakPaths.HeroScenePath);
                EditorApplication.Exit(0);
            }
            catch (Exception e)
            {
                Debug.LogError("SUNBREAK_HERO_FAIL: " + e);
                EditorApplication.Exit(1);
            }
        }

        [MenuItem("SUNBREAK/Build Hero Street")]
        static void Menu()
        {
            BuildInternal();
            EditorUtility.DisplayDialog("SUNBREAK", "Hero street rebuilt:\n" + SunbreakPaths.HeroScenePath, "OK");
        }

        static void BuildInternal()
        {
            KitLibrary.ClearCache();
            EnsureFolders();

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // 1) THE LOOK — sky, sun, fog, post (biggest AAA lever, done first).
            SunbreakLook.ConfigureGroundTextureImporters();
            SunbreakLook.SetupSky();
            SunbreakLook.CreateSun();
            SunbreakLook.ConfigureFog();
            SunbreakLook.CreateVolume();

            // 2) Ground surfaces.
            Material asphalt = SunbreakLook.MakePbrGround("Road_Asphalt",
                "Assets/SUNBREAK/Art/Environment/Textures/Asphalt025A", "Asphalt025A_2K-JPG",
                new Vector2(0.25f, 0.25f), 0.28f);
            Material paving = SunbreakLook.MakePbrGround("Sidewalk_Paving",
                "Assets/SUNBREAK/Art/Environment/Textures/PavingStones128", "PavingStones128_2K-JPG",
                new Vector2(0.5f, 0.5f), 0.20f);

            var root = new GameObject("HeroStreet").transform;
            BuildGround(root, asphalt);
            BuildSidewalks(root, paving);
            BuildRoadMarkings(root);

            // 3) Cohesive Kenney city.
            BuildBuildingLines(root);
            BuildTowerVista(root);
            BuildBackdrop(root);

            // 4) Street life.
            BuildStreetlights(root);
            BuildPalms(root);
            BuildParkedCars(root);
            BuildProps(root);

            // 5) The drivable car (ported handling) + player + camera.
            ArcadeCarController car = BuildDrivableCar(root, new Vector3(-2.4f, 1.1f, 62f), 180f);
            var animResult = HumanoidAnimatorSetup.Build();
            PlayerController player = BuildPlayer(root, new Vector3(7.6f, 1.1f, 74f), animResult);
            BuildCameraRig(player);

            Debug.Log("SUNBREAK_HERO_CHARACTER: " + animResult.note);

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, SunbreakPaths.HeroScenePath))
                throw new Exception("Failed to save scene to " + SunbreakPaths.HeroScenePath);

            SetAsFirstBuildScene(SunbreakPaths.HeroScenePath);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
        }

        // ── Ground / sidewalks / markings ───────────────────────────────────────
        static void BuildGround(Transform parent, Material asphalt)
        {
            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Ground_Asphalt";
            ground.transform.SetParent(parent, false);
            ground.transform.localScale = new Vector3(GroundHalf * 2f / 10f, 1f, GroundHalf * 2f / 10f);
            ground.transform.position = Vector3.zero;
            var mr = ground.GetComponent<MeshRenderer>();
            mr.sharedMaterial = asphalt;
            // Tile the ambientCG asphalt at ~4 m across the whole plane.
            MarkStatic(ground);
        }

        static void BuildSidewalks(Transform parent, Material paving)
        {
            float cx = RoadHalf + SidewalkWidth * 0.5f;
            float len = StreetZMax - StreetZMin;
            float cz = (StreetZMax + StreetZMin) * 0.5f;
            foreach (int s in new[] { -1, 1 })
            {
                var walk = GameObject.CreatePrimitive(PrimitiveType.Cube);
                walk.name = s > 0 ? "Sidewalk_East" : "Sidewalk_West";
                walk.transform.SetParent(parent, false);
                walk.transform.localScale = new Vector3(SidewalkWidth, SidewalkTop, len);
                walk.transform.position = new Vector3(s * cx, SidewalkTop * 0.5f, cz);
                walk.GetComponent<MeshRenderer>().sharedMaterial = paving;
                SetTiling(walk, new Vector2(SidewalkWidth * 0.5f, len * 0.5f));
                MarkStatic(walk);
            }
        }

        static void BuildRoadMarkings(Transform parent)
        {
            var line = LitMaterial("Mark_White", new Color(0.82f, 0.82f, 0.78f), 0f, 0.15f, Color.black);
            var yellow = LitMaterial("Mark_Yellow", new Color(0.86f, 0.66f, 0.08f), 0f, 0.15f, Color.black);
            var marks = new GameObject("RoadMarkings").transform;
            marks.SetParent(parent, false);

            float len = StreetZMax - StreetZMin;
            float cz = (StreetZMax + StreetZMin) * 0.5f;
            // Double-yellow centre.
            Strip(marks, yellow, new Vector3(-0.18f, 0.021f, cz), new Vector3(0.16f, 0.02f, len));
            Strip(marks, yellow, new Vector3(0.18f, 0.021f, cz), new Vector3(0.16f, 0.02f, len));
            // White lane edges.
            Strip(marks, line, new Vector3(-RoadHalf + 0.5f, 0.021f, cz), new Vector3(0.16f, 0.02f, len));
            Strip(marks, line, new Vector3(RoadHalf - 0.5f, 0.021f, cz), new Vector3(0.16f, 0.02f, len));
            // Dashed lane divider each side of centre.
            for (float z = StreetZMin + 2f; z < StreetZMax; z += 6f)
            {
                Strip(marks, line, new Vector3(-3f, 0.021f, z), new Vector3(0.16f, 0.02f, 3f));
                Strip(marks, line, new Vector3(3f, 0.021f, z), new Vector3(0.16f, 0.02f, 3f));
            }
            // Crosswalk near the spawn.
            for (float x = -RoadHalf + 0.8f; x <= RoadHalf - 0.8f; x += 1.1f)
                Strip(marks, line, new Vector3(x, 0.022f, 80f), new Vector3(0.5f, 0.02f, 3.4f));
        }

        // ── Buildings ───────────────────────────────────────────────────────────
        static string[] MidRise()
        {
            var l = new List<string>();
            for (char c = 'a'; c <= 'n'; c++) l.Add("building-" + c);
            return l.ToArray();
        }
        static string[] Towers() => new[]
        {
            "building-skyscraper-a", "building-skyscraper-b", "building-skyscraper-c",
            "building-skyscraper-d", "building-skyscraper-e",
        };
        static string[] LowDetail()
        {
            var l = new List<string>();
            for (char c = 'a'; c <= 'n'; c++) l.Add("low-detail-building-" + c);
            l.Add("low-detail-building-wide-a");
            l.Add("low-detail-building-wide-b");
            return l.ToArray();
        }

        static void BuildBuildingLines(Transform parent)
        {
            var group = new GameObject("Buildings").transform;
            group.SetParent(parent, false);
            var rng = new System.Random(0x5A17B10C);
            string[] mid = MidRise();
            string[] towers = Towers();

            foreach (int side in new[] { -1, 1 })
            {
                float yaw = (side > 0 ? -90f : 90f) + FrontOffset;
                float z = StreetZMin + 2f;
                int idx = 0;
                while (z <= StreetZMax)
                {
                    bool tall = rng.NextDouble() < 0.22;
                    string model = tall
                        ? towers[rng.Next(towers.Length)]
                        : mid[(idx + (side > 0 ? 0 : 7)) % mid.Length];
                    float height = tall
                        ? 42f + (float)rng.NextDouble() * 30f
                        : 13f + (float)(rng.NextDouble() * rng.NextDouble()) * 20f;

                    var go = KitLibrary.Instantiate(KitLibrary.CommercialKit, model, group);
                    if (go == null) { z += 20f; continue; }

                    Bounds b = KitLibrary.FitByHeight(go, 0f, z, 0f, height, yaw);
                    float dx = side > 0 ? BuildingFront - b.min.x : -BuildingFront - b.max.x;
                    go.transform.position += new Vector3(dx, 0f, 0f);
                    b = KitLibrary.WorldBounds(go);
                    AddBoxCollider(go, b);
                    MarkStatic(go);

                    z += Mathf.Max(6f, b.size.z) + 1.5f + (float)rng.NextDouble() * 2.5f;
                    idx++;
                }
            }
        }

        static void BuildTowerVista(Transform parent)
        {
            var group = new GameObject("TowerVista").transform;
            group.SetParent(parent, false);
            var rng = new System.Random(0x70E12A);
            string[] towers = Towers();

            // Hero "Solaris Tower" terminating the north vista + flankers.
            var hero = KitLibrary.Instantiate(KitLibrary.CommercialKit, "building-skyscraper-a", group);
            if (hero != null)
            {
                hero.name = "Solaris Tower";
                Bounds hb = KitLibrary.FitByHeight(hero, 0f, StreetZMin - 46f, 0f, 96f, 0f);
                AddBoxCollider(hero, hb); MarkStatic(hero);
            }
            for (int i = 0; i < 6; i++)
            {
                float x = (i - 2.5f) * 34f + (float)(rng.NextDouble() * 10 - 5);
                float z = StreetZMin - 30f - (float)rng.NextDouble() * 40f;
                if (Mathf.Abs(x) < 24f) continue; // keep the vista centre clear for the hero
                var go = KitLibrary.Instantiate(KitLibrary.CommercialKit, towers[rng.Next(towers.Length)], group);
                if (go == null) continue;
                Bounds b = KitLibrary.FitByHeight(go, x, z, 0f, 60f + (float)rng.NextDouble() * 50f, 0f);
                MarkStatic(go);
            }
        }

        static void BuildBackdrop(Transform parent)
        {
            var group = new GameObject("Backdrop").transform;
            group.SetParent(parent, false);
            var rng = new System.Random(0xBADC0DE);
            string[] low = LowDetail();
            // A sparse second row behind the hero buildings so the horizon reads as a city.
            foreach (int side in new[] { -1, 1 })
            {
                for (float z = StreetZMin; z <= StreetZMax; z += 26f + (float)rng.NextDouble() * 14f)
                {
                    float x = side * (46f + (float)rng.NextDouble() * 40f);
                    var go = KitLibrary.Instantiate(KitLibrary.CommercialKit, low[rng.Next(low.Length)], group);
                    if (go == null) continue;
                    float yaw = (side > 0 ? -90f : 90f) + FrontOffset;
                    KitLibrary.FitByHeight(go, x, z, 0f, 16f + (float)(rng.NextDouble() * rng.NextDouble()) * 34f, yaw);
                    MarkStatic(go);
                }
            }
        }

        // ── Street furniture ────────────────────────────────────────────────────
        static void BuildStreetlights(Transform parent)
        {
            var group = new GameObject("Streetlights").transform;
            group.SetParent(parent, false);
            // Warm-white, gently emissive lamp head (subtle bloom, no orange blobs).
            var glow = LitMaterial("Lamp_Glow", new Color(1f, 0.95f, 0.85f), 0f, 0.4f,
                new Color(1f, 0.92f, 0.78f) * 1.35f);
            string model = KitLibrary.Has(KitLibrary.RoadsKit, "light-curved") ? "light-curved" : "light-square";
            float lx = RoadHalf + 0.7f;

            for (float z = StreetZMin + 8f; z <= StreetZMax - 4f; z += 26f)
            {
                foreach (int side in new[] { -1, 1 })
                {
                    var go = KitLibrary.Instantiate(KitLibrary.RoadsKit, model, group);
                    if (go == null) continue;
                    // Curved arm reaches over the road: face the lamp toward the centre.
                    float yaw = side > 0 ? 90f : -90f;
                    Bounds b = KitLibrary.FitByHeight(go, side * lx, z, SidewalkTop, 7.2f, yaw);

                    // Warm lamp: point light + small emissive head at the fitted arm tip.
                    var head = new GameObject("Lamp").transform;
                    head.SetParent(group, false);
                    head.position = new Vector3(side * (RoadHalf - 1.2f), b.max.y - 0.55f, z);

                    var bulb = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                    bulb.name = "Bulb";
                    Kill(bulb.GetComponent<Collider>());
                    bulb.transform.SetParent(head, false);
                    bulb.transform.localScale = Vector3.one * 0.28f;
                    bulb.GetComponent<MeshRenderer>().sharedMaterial = glow;

                    var lightGo = new GameObject("Point");
                    lightGo.transform.SetParent(head, false);
                    var pl = lightGo.AddComponent<Light>();
                    pl.type = LightType.Point;
                    pl.color = new Color(1f, 0.88f, 0.68f);
                    pl.intensity = 6f;
                    pl.range = 16f;
                    pl.shadows = LightShadows.None;
                    MarkStatic(go);
                }
            }
        }

        static void BuildPalms(Transform parent)
        {
            if (!KitLibrary.Has(KitLibrary.NatureKit, "tree_palmDetailedTall")) return;
            // Re-run the import with the current (materials-on) settings so palms keep colour.
            AssetDatabase.ImportAsset(KitLibrary.NatureKit,
                ImportAssetOptions.ForceUpdate | ImportAssetOptions.ImportRecursive);
            var group = new GameObject("Palms").transform;
            group.SetParent(parent, false);
            var rng = new System.Random(0x9A1);
            string[] palms = { "tree_palmDetailedTall", "tree_palmDetailedShort", "tree_palm", "tree_palmBend" };
            float px = RoadHalf + SidewalkWidth - 0.9f;
            for (float z = StreetZMin + 21f; z <= StreetZMax - 8f; z += 26f)
            {
                foreach (int side in new[] { -1, 1 })
                {
                    var go = KitLibrary.Instantiate(KitLibrary.NatureKit, palms[rng.Next(palms.Length)], group);
                    if (go == null) continue;
                    KitLibrary.FitByHeight(go, side * px, z, SidewalkTop, 7.5f + (float)rng.NextDouble() * 2.5f,
                        (float)rng.NextDouble() * 360f);
                    MarkStatic(go);
                }
            }
        }

        static void BuildParkedCars(Transform parent)
        {
            var group = new GameObject("ParkedCars").transform;
            group.SetParent(parent, false);
            (string body, float z, int side, float len)[] parked =
            {
                ("van", 30f, 1, 4.4f),
                ("taxi", 6f, -1, 4.2f),
                ("suv-luxury", -18f, 1, 4.6f),
                ("delivery", -44f, -1, 4.6f),
                ("sedan-sports", 44f, -1, 4.2f),
            };
            foreach (var p in parked)
            {
                float x = p.side * (RoadHalf - 1.3f);
                float yaw = p.side > 0 ? 0f : 180f;
                var go = AssembleCar(p.body, "wheel-default", p.len, group, out _, out _, out _);
                if (go == null) continue;
                go.transform.rotation = Quaternion.Euler(0f, yaw, 0f);
                // Sit on the road (y=0); AssembleCar centres wheels at local y=0 contact.
                go.transform.position = new Vector3(x, 0f, p.z);
                MarkStatic(go);
            }
        }

        static void BuildProps(Transform parent)
        {
            var group = new GameObject("Props").transform;
            group.SetParent(parent, false);
            string cone = KitLibrary.Has(KitLibrary.RoadsKit, "construction-cone") ? "construction-cone"
                : (KitLibrary.Has(KitLibrary.CarKit, "cone") ? "cone" : null);
            if (cone == null) return;
            string kit = KitLibrary.Has(KitLibrary.RoadsKit, "construction-cone") ? KitLibrary.RoadsKit : KitLibrary.CarKit;
            var rng = new System.Random(0xC0FFEE);
            for (int i = 0; i < 6; i++)
            {
                var go = KitLibrary.Instantiate(kit, cone, group);
                if (go == null) continue;
                KitLibrary.FitByHeight(go, -RoadHalf + 0.8f + i * 0.9f, 16f + i * 1.4f, 0f, 0.7f, 0f);
            }
        }

        // ── Cars (shared visual assembly) ───────────────────────────────────────
        struct WheelFit { public float halfTrack, frontZ, rearZ, centerY, radius; }

        /// <summary>
        /// Build a car visual (Kenney body + 4 fitted wheels) with the body centred so its
        /// wheels contact the local y=0 plane. Returns wheel transforms in FL,FR,RL,RR order
        /// and the derived wheel fit (for wiring the physics wheels to match).
        /// </summary>
        static GameObject AssembleCar(string body, string wheel, float targetLen, Transform parent,
            out Transform[] wheels, out Bounds bodyBounds, out WheelFit fit)
        {
            wheels = null; bodyBounds = default; fit = default;
            var bodyModel = KitLibrary.LoadModel(KitLibrary.CarKit, body);
            if (bodyModel == null) return null;

            var rootGo = new GameObject("Car_" + body);
            rootGo.transform.SetParent(parent, false);
            var rootT = rootGo.transform;

            var bodyGo = KitLibrary.Instantiate(KitLibrary.CarKit, body, rootT);
            // Fit body length (its longest horizontal axis) to target, centre at root origin.
            bodyGo.transform.localScale = Vector3.one;
            bodyGo.transform.localPosition = Vector3.zero;
            Bounds b = KitLibrary.WorldBounds(bodyGo);
            float natLen = Mathf.Max(b.size.x, b.size.z, 0.001f);
            float scale = targetLen / natLen;
            bodyGo.transform.localScale = Vector3.one * scale;
            b = KitLibrary.WorldBounds(bodyGo);
            // Re-centre the body on the root (x,z centred; sit body so wheels reach y=0).
            Vector3 off = new Vector3(-b.center.x, -b.min.y, -b.center.z);
            bodyGo.transform.position += off;
            b = KitLibrary.WorldBounds(bodyGo);
            bodyBounds = b;

            // Derive wheels from the fitted body box.
            fit = new WheelFit
            {
                halfTrack = b.size.x * 0.5f * 0.92f,
                frontZ = b.size.z * 0.5f * 0.66f,
                rearZ = -b.size.z * 0.5f * 0.66f,
                radius = Mathf.Clamp(b.size.y * 0.28f, 0.28f, 0.55f),
            };
            fit.centerY = fit.radius; // wheels sit so their bottom touches y=0

            wheels = new Transform[4];
            (float x, float z)[] pos =
            {
                (-fit.halfTrack, fit.frontZ), (fit.halfTrack, fit.frontZ),
                (-fit.halfTrack, fit.rearZ), (fit.halfTrack, fit.rearZ),
            };
            string[] names = { "Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR" };
            for (int i = 0; i < 4; i++)
            {
                var pivot = new GameObject(names[i]).transform;
                pivot.SetParent(rootT, false);
                pivot.localPosition = new Vector3(pos[i].x, fit.centerY, pos[i].z);

                var wGo = KitLibrary.Instantiate(KitLibrary.CarKit, wheel, pivot);
                if (wGo != null)
                {
                    wGo.transform.localScale = Vector3.one;
                    Bounds wb = KitLibrary.WorldBounds(wGo);
                    float wlen = Mathf.Max(wb.size.x, wb.size.y, wb.size.z, 0.001f);
                    float ws = (fit.radius * 2f) / wlen;
                    wGo.transform.localScale = Vector3.one * ws;
                    wb = KitLibrary.WorldBounds(wGo);
                    wGo.transform.position += (pivot.position - wb.center);
                    if (pos[i].x > 0f) wGo.transform.localRotation = Quaternion.Euler(0f, 180f, 0f); // hubcap out
                }
                wheels[i] = pivot;
            }
            return rootGo;
        }

        static ArcadeCarController BuildDrivableCar(Transform parent, Vector3 spawn, float yaw)
        {
            var go = AssembleCar("sedan", "wheel-default", 4.2f, parent, out Transform[] wheels,
                out Bounds bodyBounds, out WheelFit fit);
            if (go == null) return null;
            go.name = "PlayerCar_Sedan";
            go.tag = "Player";
            go.transform.SetPositionAndRotation(spawn, Quaternion.Euler(0f, yaw, 0f));

            var rb = go.AddComponent<Rigidbody>();
            var box = go.AddComponent<BoxCollider>();
            box.center = new Vector3(0f, bodyBounds.size.y * 0.5f, 0f);
            box.size = new Vector3(bodyBounds.size.x * 0.95f, bodyBounds.size.y, bodyBounds.size.z);

            var ctrl = go.AddComponent<ArcadeCarController>();
            // Keep the ported dynamics (forces/friction/suspension) but match the wheel
            // geometry to the actual Kenney body so visuals & physics agree.
            var cfg = VehicleConfig.Sedan();
            float rest = cfg.wheels.Length > 0 ? cfg.wheels[0].suspensionRestLength : 0.32f;
            for (int i = 0; i < cfg.wheels.Length && i < 4; i++)
            {
                float x = (i % 2 == 0) ? -fit.halfTrack : fit.halfTrack;
                float z = (i < 2) ? fit.frontZ : fit.rearZ;
                cfg.wheels[i].position = new Vector3(x, fit.centerY + rest, z);
                cfg.wheels[i].radius = fit.radius;
            }
            cfg.chassisHalfExtents = new Vector3(bodyBounds.size.x * 0.5f, bodyBounds.size.y * 0.5f, bodyBounds.size.z * 0.5f);
            ctrl.config = cfg;
            ctrl.wheelVisuals = wheels;
            ctrl.groundMask = ~0;

            rb.mass = cfg.mass;
            return ctrl;
        }

        // ── Player + camera (mirrors the greybox rig) ───────────────────────────
        static PlayerController BuildPlayer(Transform parent, Vector3 spawn, HumanoidAnimatorSetup.Result anim)
        {
            var player = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            player.name = "Player";
            player.tag = "Player";
            Kill(player.GetComponent<Collider>());
            player.transform.SetParent(parent, false);
            player.transform.SetPositionAndRotation(spawn, Quaternion.Euler(0f, 180f, 0f)); // face north, down the street
            var capsuleMr = player.GetComponent<MeshRenderer>();
            capsuleMr.sharedMaterial = LitMaterial("PlayerCapsule", new Color(0.95f, 0.55f, 0.16f), 0f, 0.3f, Color.black);

            var cc = player.AddComponent<CharacterController>();
            cc.height = 2f; cc.radius = 0.5f; cc.center = Vector3.zero; cc.slopeLimit = 50f; cc.stepOffset = 0.4f;

            var controller = player.AddComponent<PlayerController>();
            var locomotion = player.AddComponent<PlayerLocomotionAnimator>();

            Animator animator;
            if (anim.characterModel != null)
            {
                // Real Mixamo character as the visual; capsule stays for collision only.
                capsuleMr.enabled = false;
                var charGo = (GameObject)PrefabUtility.InstantiatePrefab(anim.characterModel);
                charGo.name = "Character";
                charGo.transform.SetParent(player.transform, false);
                charGo.transform.localPosition = Vector3.zero;
                charGo.transform.localRotation = Quaternion.identity;
                charGo.transform.localScale = Vector3.one;

                Bounds b = KitLibrary.WorldBounds(charGo);
                float h = Mathf.Max(0.01f, b.size.y);
                charGo.transform.localScale = Vector3.one * (1.9f / h);
                b = KitLibrary.WorldBounds(charGo);
                float localFeet = b.min.y - player.transform.position.y;
                charGo.transform.localPosition += new Vector3(0f, -1f - localFeet, 0f);

                animator = charGo.GetComponent<Animator>() ?? charGo.AddComponent<Animator>();
                if (anim.characterAvatar != null) animator.avatar = anim.characterAvatar;
            }
            else
            {
                // Placeholder: capsule with the (empty) blend-tree controller awaiting Mixamo.
                animator = player.AddComponent<Animator>();
            }

            animator.runtimeAnimatorController = anim.controller;
            animator.applyRootMotion = false;
            locomotion.animator = animator;

            var target = new GameObject("CameraTarget").transform;
            target.SetParent(player.transform, false);
            target.localPosition = new Vector3(0f, 0.6f, 0f);
            return controller;
        }

        static void BuildCameraRig(PlayerController player)
        {
            Transform camTarget = player.transform.Find("CameraTarget");
            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 1500f;

            var camData = cam.GetUniversalAdditionalCameraData();
            camData.renderPostProcessing = true;
            camData.antialiasing = UnityEngine.Rendering.Universal.AntialiasingMode.SubpixelMorphologicalAntiAliasing;

            camGo.AddComponent<CinemachineBrain>();
            Vector3 startPos = camTarget.position + new Vector3(2.5f, 2.2f, 9f);
            camGo.transform.position = startPos;
            camGo.transform.rotation = Quaternion.LookRotation((camTarget.position - startPos).normalized, Vector3.up);

            var vcamGo = new GameObject("CM ThirdPerson");
            var vcam = vcamGo.AddComponent<CinemachineCamera>();
            vcam.Follow = camTarget;
            vcam.LookAt = camTarget;
            vcam.Lens.FieldOfView = 52f;

            var orbital = vcamGo.AddComponent<CinemachineOrbitalFollow>();
            orbital.OrbitStyle = CinemachineOrbitalFollow.OrbitStyles.Sphere;
            orbital.Radius = 6.5f;
            orbital.HorizontalAxis.Range = new Vector2(-180f, 180f);
            orbital.HorizontalAxis.Wrap = true;
            orbital.HorizontalAxis.Value = 180f; // look north down the street
            orbital.VerticalAxis.Range = new Vector2(-20f, 65f);
            orbital.VerticalAxis.Value = 12f;
            vcamGo.AddComponent<CinemachineRotationComposer>();

            var rig = vcamGo.AddComponent<ThirdPersonCameraRig>();
            rig.player = player;
            rig.orbital = orbital;
        }

        // ── Helpers ─────────────────────────────────────────────────────────────
        static void Strip(Transform parent, Material mat, Vector3 pos, Vector3 scale)
        {
            var s = GameObject.CreatePrimitive(PrimitiveType.Cube);
            s.name = "mark";
            Kill(s.GetComponent<Collider>());
            s.transform.SetParent(parent, false);
            s.transform.localPosition = pos;
            s.transform.localScale = scale;
            s.GetComponent<MeshRenderer>().sharedMaterial = mat;
            MarkStatic(s);
        }

        static void AddBoxCollider(GameObject go, Bounds worldBounds)
        {
            var bc = go.AddComponent<BoxCollider>();
            bc.center = go.transform.InverseTransformPoint(worldBounds.center);
            Vector3 ls = go.transform.lossyScale;
            bc.size = new Vector3(
                worldBounds.size.x / Mathf.Max(0.0001f, ls.x),
                worldBounds.size.y / Mathf.Max(0.0001f, ls.y),
                worldBounds.size.z / Mathf.Max(0.0001f, ls.z));
        }

        static Material LitMaterial(string name, Color color, float metallic, float smoothness, Color emission)
        {
            const string dir = "Assets/SUNBREAK/Art/Materials";
            string path = dir + "/" + name + ".mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (mat == null) { mat = new Material(shader) { name = name }; AssetDatabase.CreateAsset(mat, path); }
            else mat.shader = shader;
            mat.SetColor("_BaseColor", color);
            if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", metallic);
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", smoothness);
            if (emission.maxColorComponent > 0.001f)
            {
                mat.EnableKeyword("_EMISSION");
                mat.SetColor("_EmissionColor", emission);
                mat.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            }
            EditorUtility.SetDirty(mat);
            return mat;
        }

        static void SetTiling(GameObject go, Vector2 tiling)
        {
            var mr = go.GetComponent<MeshRenderer>();
            if (mr == null) return;
            var mat = mr.sharedMaterial;
            if (mat == null) return;
            // Clone so per-instance tiling doesn't fight the shared material.
            var inst = new Material(mat) { name = mat.name + "_tiled" };
            inst.SetTextureScale("_BaseMap", tiling);
            if (inst.HasProperty("_BumpMap")) inst.SetTextureScale("_BumpMap", tiling);
            if (inst.HasProperty("_OcclusionMap")) inst.SetTextureScale("_OcclusionMap", tiling);
            AssetDatabase.CreateAsset(inst, $"Assets/SUNBREAK/Art/Materials/{go.name}_tiled.mat");
            mr.sharedMaterial = inst;
        }

        static void MarkStatic(GameObject go) =>
            GameObjectUtility.SetStaticEditorFlags(go,
                StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic);

        static void Kill(UnityEngine.Object o) { if (o != null) UnityEngine.Object.DestroyImmediate(o); }

        static void EnsureFolders()
        {
            foreach (var (p, c) in new[]
            {
                ("Assets/SUNBREAK", "Art"), ("Assets/SUNBREAK/Art", "Materials"),
                ("Assets/SUNBREAK", "Scenes"), ("Assets/SUNBREAK", "Settings"),
            })
                if (!AssetDatabase.IsValidFolder(p + "/" + c)) AssetDatabase.CreateFolder(p, c);
        }

        static void SetAsFirstBuildScene(string scenePath)
        {
            var scenes = new List<EditorBuildSettingsScene> { new EditorBuildSettingsScene(scenePath, true) };
            foreach (var s in EditorBuildSettings.scenes)
                if (s.path != scenePath) scenes.Add(new EditorBuildSettingsScene(s.path, false));
            EditorBuildSettings.scenes = scenes.ToArray();
        }
    }
}
