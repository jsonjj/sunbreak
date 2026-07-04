using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.UI;
using Unity.AI.Navigation;
using SUNBREAK.Combat;
using SUNBREAK.EditorTools.Characters;
using SUNBREAK.Vehicles;
using SUNBREAK.World;

namespace SUNBREAK.BuildTools
{
    /// <summary>
    /// Renders the hero street from several cinematic angles to PNGs under
    /// <c>./BuildLogs/shots/slice1/</c>, headlessly — a street establishing shot, an
    /// over-the-shoulder near a building, and hero/chase shots of the car — so the look can
    /// be eyeballed without opening the Editor. Falls back to the greybox scene if the hero
    /// scene doesn't exist yet. Cinemachine doesn't tick in a synchronous -executeMethod
    /// call, so the camera is placed directly for deterministic framings.
    /// Invoke: <c>-executeMethod SUNBREAK.BuildTools.CaptureScreenshot.Capture</c>.
    /// </summary>
    public static class CaptureScreenshot
    {
        const int Width = 1920;
        const int Height = 1080;

        public static void Capture()
        {
            try
            {
                if (File.Exists(SunbreakPaths.IslandScenePath))
                {
                    CaptureIsland();
                    CaptureSlice4();
                    CaptureMenu();
                }
                else if (File.Exists(SunbreakPaths.HeroScenePath))
                    CaptureHero();
                else if (File.Exists(SunbreakPaths.ScenePath))
                    CaptureGreybox();
                else
                    throw new Exception("No scene found (island, hero or greybox).");

                EditorApplication.Exit(0);
            }
            catch (Exception e)
            {
                Debug.LogError("SUNBREAK_SHOT_FAIL: " + e);
                EditorApplication.Exit(1);
            }
        }

        static void CaptureIsland()
        {
            EditorSceneManager.OpenScene(SunbreakPaths.IslandScenePath, OpenSceneMode.Single);
            Directory.CreateDirectory(SunbreakPaths.Slice3ShotsDir);

            var gen = UnityEngine.Object.FindFirstObjectByType<CityGenerator>();
            if (gen == null) throw new Exception("No CityGenerator in island scene.");
            gen.Generate(); // build the city in edit mode for the shots (not saved)

            // Bake the NavMesh so spawned peds/cops can be placed (they're runtime-only otherwise).
            var surface = UnityEngine.Object.FindFirstObjectByType<NavMeshSurface>();
            if (surface != null) surface.BuildNavMesh();

            // Stage a CRIME SCENE for the stills (the AI only runs at play time): a crowd of peds
            // + a squad of cops around the player, all posed. Combat/wanted are live at runtime.
            var animators = new List<Animator>();
            Vector3 pp = FindPos("Player", Geography.PLAYER_SPAWN.position);
            pp.y = CityGenerator.TerrainHeight(pp.x, pp.z);
            StageCrimeScene(gen, pp, animators);

            // Pose the player + everyone idle (one AnimationMode session).
            bool posed = PoseHumanoids(animators);

            Camera cam = GetCamera();
            string dir = SunbreakPaths.Slice3ShotsDir;
            var shots = new List<string>();

            // 1) Pedestrians on the street.
            shots.Add(Shoot(cam, "01_pedestrians.png",
                pp + new Vector3(10f, 2.4f, -14f), pp + new Vector3(6f, 1.0f, 12f), dir));
            // 2) Police response — cops around the player + car.
            shots.Add(Shoot(cam, "02_police_response.png",
                pp + new Vector3(-3f, 2.3f, -8f), pp + new Vector3(2f, 1.1f, 6f), dir));
            // 3) Combat — close over-the-shoulder on the player facing the crowd.
            shots.Add(Shoot(cam, "03_combat.png",
                pp + new Vector3(-2.2f, 2.2f, -5.5f), pp + new Vector3(3f, 1.2f, 12f), dir));
            // 4) Crime scene wide — peds + cops + car in the street.
            shots.Add(Shoot(cam, "04_crime_scene.png",
                pp + new Vector3(16f, 9f, -18f), pp + new Vector3(2f, 1.2f, 6f), dir));
            // 5) City aerial (context).
            shots.Add(Shoot(cam, "05_island_aerial.png",
                new Vector3(250f, 230f, -250f), new Vector3(20f, 6f, 30f), dir));
            // 6) Top-down island map.
            shots.Add(ShootOrtho(cam, "06_island_map.png",
                new Vector3(0f, 400f, 20f), Geography.PLAYABLE_HALF * 1.05f, dir));

            if (posed) AnimationMode.StopAnimationMode();
            Debug.Log("SUNBREAK_SHOT_OK: " + string.Join(" | ", shots));
        }

        // ── Slice 6: character lineup (to identify the SWAT + show crowd variety) ──
        static void CaptureCharacters()
        {
            try
            {
                Directory.CreateDirectory(SunbreakPaths.Slice6ShotsDir);
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

                var sun = new GameObject("Sun").AddComponent<Light>();
                sun.type = LightType.Directional; sun.intensity = 1.15f;
                sun.transform.rotation = Quaternion.Euler(38f, 150f, 0f);
                RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
                RenderSettings.ambientLight = new Color(0.42f, 0.44f, 0.5f);

                var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
                ground.transform.localScale = Vector3.one * 6f;
                ground.GetComponent<MeshRenderer>().sharedMaterial =
                    new Material(Shader.Find("Universal Render Pipeline/Lit")) { color = new Color(0.28f, 0.29f, 0.32f) };

                // Collect skinned character FBX (same rule as the animator setup).
                var models = new List<GameObject>();
                var names = new List<string>();
                foreach (var guid in AssetDatabase.FindAssets("t:Model", new[] { EditorTools.Characters.HumanoidAnimatorSetup.MixamoDir }))
                {
                    string path = AssetDatabase.GUIDToAssetPath(guid);
                    var asset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                    string lower = Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
                    bool isChar = asset != null && asset.GetComponentInChildren<SkinnedMeshRenderer>() != null && !IsAnim(lower);
                    if (isChar) { models.Add(asset); names.Add(Path.GetFileNameWithoutExtension(path)); }
                }

                var animators = new List<Animator>();
                float spacing = 1.7f;
                float x0 = -(models.Count - 1) * 0.5f * spacing;
                for (int i = 0; i < models.Count; i++)
                {
                    var go = (GameObject)PrefabUtility.InstantiatePrefab(models[i]);
                    go.transform.position = new Vector3(x0 + i * spacing, 0f, 0f);
                    go.transform.rotation = Quaternion.Euler(0f, 180f, 0f);
                    var b = KitLibraryBounds(go);
                    float h = Mathf.Max(0.01f, b.size.y);
                    go.transform.localScale = Vector3.one * (1.8f / h);
                    var a = go.GetComponentInChildren<Animator>() ?? go.AddComponent<Animator>();
                    animators.Add(a);
                }
                Debug.Log("SUNBREAK_LINEUP (left→right): " + string.Join(", ", names));

                bool posed = PoseHumanoids(animators);
                var cam = new GameObject("Cam", typeof(Camera)).GetComponent<Camera>();
                cam.tag = "MainCamera";
                float width = Mathf.Max(4f, models.Count * spacing);
                var camPos = new Vector3(0f, 1.6f, -width * 0.85f);
                Shoot(cam, "01_characters.png", camPos, new Vector3(0f, 1.0f, 0f), SunbreakPaths.Slice6ShotsDir);
                if (posed) AnimationMode.StopAnimationMode();
                Debug.Log("SUNBREAK_SHOT6_OK: character lineup");
            }
            catch (Exception e) { Debug.LogWarning("SUNBREAK_SHOT: character lineup failed: " + e.Message); }
        }

        static bool IsAnim(string n) =>
            n.Contains("idle") || n.Contains("walk") || n.Contains("run") || n.Contains("jump") || n.Contains("fire") ||
            n.Contains("firing") || n.Contains("hit") || n.Contains("death") || n.Contains("kneel") || n.Contains("put away") ||
            n.Contains("stomach") || n.Contains("reaction") || n.Contains("pistol") || n.Contains("rifle");

        static Bounds KitLibraryBounds(GameObject go)
        {
            var rs = go.GetComponentsInChildren<Renderer>();
            if (rs.Length == 0) return new Bounds(go.transform.position, new Vector3(0.5f, 1.8f, 0.5f));
            Bounds b = rs[0].bounds;
            for (int i = 1; i < rs.Length; i++) b.Encapsulate(rs[i].bounds);
            return b;
        }

        // ── Slice 4 shots: economy markers, missions, and the night look ──────────
        static void CaptureSlice4()
        {
            EditorSceneManager.OpenScene(SunbreakPaths.IslandScenePath, OpenSceneMode.Single);
            Directory.CreateDirectory(SunbreakPaths.Slice4ShotsDir);

            var gen = UnityEngine.Object.FindFirstObjectByType<CityGenerator>();
            if (gen == null) return;
            gen.Generate();

            Vector3 s = Geography.PLAYER_SPAWN.position;
            Vector3 pp = new Vector3(s.x, CityGenerator.TerrainHeight(s.x, s.z), s.z);
            Camera cam = GetCamera();
            string dir = SunbreakPaths.Slice4ShotsDir;
            var shots = new List<string>();

            bool posed = PoseCharacterIdle(); // player idle instead of a T-pose

            // Economy + mission markers (illustrative beacons; runtime ones are placed at canon
            // district coords). ATM near spawn + the canon m01 giver/objective for the mission still.
            Beacon(new Vector3(40f, 0f, -35f), new Color(0.4f, 1f, 0.55f), 6f);   // ATM / bank (canon)
            Beacon(new Vector3(12f, 0f, -9f), new Color(1f, 0.4f, 0.3f), 6f);     // gun-store marker
            Beacon(new Vector3(27f, 0f, -20f), new Color(0.4f, 0.7f, 1f), 6f);    // dealership marker
            Beacon(new Vector3(8f, 0f, 2f), new Color(1f, 0.82f, 0.28f), 7f);     // m01 giver "Cami"
            Beacon(new Vector3(8f, 0f, -6f), new Color(0.3f, 0.8f, 1f), 40f);     // m01 objective waypoint

            // Daytime economy + mission stills (street-level along the beacon corridor).
            shots.Add(Shoot(cam, "02_shops.png", new Vector3(12f, 4f, -26f), new Vector3(12f, 1.5f, -6f), dir));
            shots.Add(Shoot(cam, "03_mission.png", new Vector3(9f, 4f, -24f), new Vector3(7f, 1.5f, 3f), dir));

            // Flip to NIGHT and shoot the GTA look.
            if (posed) AnimationMode.StopAnimationMode();
            ForceNight(gen, pp);
            posed = PoseCharacterIdle();
            shots.Add(Shoot(cam, "01_night_city.png", pp + new Vector3(9f, 2.6f, -18f), pp + new Vector3(1f, 2.2f, 34f), dir));
            shots.Add(Shoot(cam, "04_night_street.png", pp + new Vector3(24f, 9f, -30f), pp + new Vector3(-2f, 2.5f, 16f), dir));
            if (posed) AnimationMode.StopAnimationMode();

            Debug.Log("SUNBREAK_SHOT4_OK: " + string.Join(" | ", shots));
        }

        static void ForceNight(CityGenerator gen, Vector3 near)
        {
            foreach (var l in UnityEngine.Object.FindObjectsByType<Light>(FindObjectsSortMode.None))
                if (l.type == LightType.Directional)
                {
                    l.intensity = 0.12f;
                    l.color = new Color(0.45f, 0.5f, 0.72f);
                    l.transform.rotation = Quaternion.Euler(62f, 28f, 0f);
                }

            if (RenderSettings.skybox != null)
            {
                var sky = new Material(RenderSettings.skybox);
                if (sky.HasProperty("_Exposure")) sky.SetFloat("_Exposure", 0.06f);
                RenderSettings.skybox = sky;
            }
            // Flat cool ambient at night (the warm skybox GI was the red bleed on the buildings).
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.07f, 0.08f, 0.13f);
            RenderSettings.fogColor = new Color(0.04f, 0.05f, 0.09f);
            DynamicGI.UpdateEnvironment();

            // Buildings stay dark; lamps glow softly; the scene is carried by modest warm pools.
            if (gen.cityMat != null) { gen.cityMat.DisableKeyword("_EMISSION"); gen.cityMat.SetColor("_EmissionColor", Color.black); }
            if (gen.propMat != null) { gen.propMat.EnableKeyword("_EMISSION"); gen.propMat.SetColor("_EmissionColor", new Color(0.28f, 0.22f, 0.13f)); }

            for (int i = 0; i < 7; i++)
            {
                float a = i / 7f * Mathf.PI * 2f;
                float r = 12f + (i % 3) * 9f;
                var go = new GameObject("nlamp");
                go.transform.position = near + new Vector3(Mathf.Cos(a) * r, 5f, Mathf.Sin(a) * r + 10f);
                var pl = go.AddComponent<Light>();
                pl.type = LightType.Point; pl.range = 17f; pl.intensity = 2.6f; pl.color = new Color(1f, 0.84f, 0.58f);
            }
        }

        static GameObject Beacon(Vector3 groundPos, Color c, float height)
        {
            float g = CityGenerator.TerrainHeight(groundPos.x, groundPos.z);
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            var col = go.GetComponent<Collider>(); if (col) UnityEngine.Object.DestroyImmediate(col);
            float w = height > 20f ? 1.2f : 0.5f;
            go.transform.localScale = new Vector3(w, height, w);
            go.transform.position = new Vector3(groundPos.x, g + height, groundPos.z);
            var mat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = c };
            var r = go.GetComponent<MeshRenderer>();
            r.sharedMaterial = mat; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }

        static void CaptureMenu()
        {
            try
            {
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                Directory.CreateDirectory(SunbreakPaths.Slice4ShotsDir);

                var camGo = new GameObject("Cam", typeof(Camera));
                var cam = camGo.GetComponent<Camera>();
                cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = Color.black;

                var canvasGo = new GameObject("Canvas");
                var canvas = canvasGo.AddComponent<Canvas>();
                canvas.renderMode = RenderMode.ScreenSpaceCamera;
                canvas.worldCamera = cam; canvas.planeDistance = 10f;
                var scaler = canvasGo.AddComponent<CanvasScaler>();
                scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
                scaler.referenceResolution = new Vector2(1920, 1080);

                var menu = canvasGo.AddComponent<SUNBREAK.UI.MainMenu>();
                menu.Populate(canvasGo.transform, Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"));
                Canvas.ForceUpdateCanvases();

                string path = Path.Combine(SunbreakPaths.Slice4ShotsDir, "05_main_menu.png");
                RenderToPng(cam, path);
                Debug.Log("SUNBREAK_SHOTMENU_OK: " + path);
            }
            catch (Exception e) { Debug.LogWarning("SUNBREAK_SHOT: menu shot failed: " + e.Message); }
        }

        /// <summary>Spawn a posed crowd of peds + a squad of cops around the player for the stills.</summary>
        static void StageCrimeScene(CityGenerator gen, Vector3 hub, List<Animator> animators)
        {
            var crowd = UnityEngine.Object.FindFirstObjectByType<CrowdFactory>();
            if (crowd == null) return;
            var player = GameObject.Find("Player");
            var pAnim = player != null ? player.GetComponentInChildren<Animator>() : null;
            if (pAnim != null) animators.Add(pAnim);

            var rng = new System.Random(31);
            // Peds scattered down the street.
            for (int i = 0; i < 12; i++)
            {
                float ang = (float)(rng.NextDouble() * Mathf.PI * 2);
                float r = 6f + (float)rng.NextDouble() * 22f;
                Vector3 pos = hub + new Vector3(Mathf.Cos(ang) * r, 0f, Mathf.Sin(ang) * r + 6f);
                var go = crowd.BuildHumanoid("PedShot", Faction.Civilian, 100f, CrowdFactory.RandomCivilianTint(),
                    out var agent, out _, out var anim);
                CrowdFactory.Place(go, agent, pos);
                if (anim != null) animators.Add(anim);
            }
            // A squad of cops closer in.
            for (int i = 0; i < 5; i++)
            {
                float ang = i / 5f * Mathf.PI * 2f;
                Vector3 pos = hub + new Vector3(Mathf.Cos(ang) * 9f, 0f, Mathf.Sin(ang) * 9f + 8f);
                var cop = crowd.SpawnCop(pos, "pistol_9mm", 0.4f, 110f, 2);
                if (cop != null)
                {
                    var a = cop.GetComponentInChildren<Animator>();
                    if (a != null) animators.Add(a);
                }
            }
        }

        static bool PoseHumanoids(List<Animator> animators)
        {
            if (animators.Count == 0) return false;
            var idle = FindIdleClip();
            if (idle == null) return false;
            try
            {
                AnimationMode.StartAnimationMode();
                AnimationMode.BeginSampling();
                foreach (var a in animators)
                    if (a != null) AnimationMode.SampleAnimationClip(a.gameObject, idle, 1.2f);
                AnimationMode.EndSampling();
                return true;
            }
            catch (Exception e) { Debug.LogWarning("SUNBREAK_SHOT: crowd pose failed: " + e.Message); return false; }
        }

        static AnimationClip FindIdleClip()
        {
            foreach (var guid in AssetDatabase.FindAssets("t:GameObject", new[] { HumanoidAnimatorSetup.MixamoDir }))
            {
                string p = AssetDatabase.GUIDToAssetPath(guid);
                if (!Path.GetFileNameWithoutExtension(p).ToLowerInvariant().Contains("idle")) continue;
                foreach (var o in AssetDatabase.LoadAllAssetsAtPath(p))
                    if (o is AnimationClip c && !c.name.StartsWith("__preview")) return c;
            }
            return null;
        }

        static string DistrictShot(Camera cam, string dir, string file, float cx, float cz, Vector3 offset, float lookY)
        {
            float g = CityGenerator.TerrainHeight(cx, cz);
            Vector3 pos = new Vector3(cx + offset.x, g + offset.y, cz + offset.z);
            Vector3 look = new Vector3(cx, g + lookY, cz);
            return Shoot(cam, file, pos, look, dir);
        }

        [MenuItem("SUNBREAK/Capture Screenshots")]
        static void Menu() => Capture();

        static void CaptureHero()
        {
            EditorSceneManager.OpenScene(SunbreakPaths.HeroScenePath, OpenSceneMode.Single);
            Directory.CreateDirectory(SunbreakPaths.Slice1ShotsDir);

            Camera cam = GetCamera();
            Vector3 playerPos = FindPos("Player", new Vector3(7.6f, 1.1f, 74f));
            Vector3 carPos = FindPos("PlayerCar_Sedan", new Vector3(-2.4f, 1.0f, 62f));

            // Animation only evaluates at runtime, so pose the character in its idle stance
            // for the still shots (otherwise it renders in the bind/T-pose).
            bool posed = PoseCharacterIdle();

            var shots = new List<string>();

            // 1) Street establishing — low golden angle looking north down the block.
            shots.Add(Shoot(cam, "01_street_establishing.png",
                new Vector3(3.6f, 3.1f, 101f), new Vector3(-1.5f, 2.2f, 30f)));

            // 2) Over-the-shoulder: character's back + the street ahead.
            shots.Add(Shoot(cam, "02_over_shoulder.png",
                playerPos + new Vector3(-0.4f, 1.95f, 6.4f), playerPos + new Vector3(-2.2f, 0.6f, -22f)));

            // 3) Car hero 3/4 view.
            shots.Add(Shoot(cam, "03_car_hero.png",
                carPos + new Vector3(4.6f, 1.9f, 5.6f), carPos + new Vector3(0f, 0.7f, 0f)));

            // 4) Low chase behind the car looking north.
            shots.Add(Shoot(cam, "04_car_chase.png",
                carPos + new Vector3(0.4f, 1.5f, 8.5f), carPos + new Vector3(-0.5f, 0.9f, -20f)));

            // 5) Elevated wide of the whole block + tower vista.
            shots.Add(Shoot(cam, "05_block_wide.png",
                new Vector3(52f, 41f, 118f), new Vector3(-2f, 12f, -25f)));

            // 6) Character portrait (front) to verify the Mixamo retarget.
            shots.Add(Shoot(cam, "06_character.png",
                playerPos + new Vector3(0.35f, 0.7f, -3.1f), playerPos + new Vector3(0f, 0.55f, 0f)));

            if (posed) AnimationMode.StopAnimationMode();
            Debug.Log("SUNBREAK_SHOT_OK: " + string.Join(" | ", shots));
        }

        /// <summary>Sample the character's idle clip in edit mode so stills aren't a T-pose.</summary>
        static bool PoseCharacterIdle()
        {
            try
            {
                var player = GameObject.Find("Player");
                var animator = player != null ? player.GetComponentInChildren<Animator>(true) : null;

                AnimationClip idle = null;
                foreach (var guid in AssetDatabase.FindAssets("t:GameObject", new[] { HumanoidAnimatorSetup.MixamoDir }))
                {
                    string p = AssetDatabase.GUIDToAssetPath(guid);
                    if (!Path.GetFileNameWithoutExtension(p).ToLowerInvariant().Contains("idle")) continue;
                    foreach (var o in AssetDatabase.LoadAllAssetsAtPath(p))
                        if (o is AnimationClip c && !c.name.StartsWith("__preview")) { idle = c; break; }
                    if (idle != null) break;
                }
                Debug.Log($"SUNBREAK_SHOT_POSE: animator={(animator != null)} idle={(idle != null)}");
                if (animator == null || idle == null) return false;

                AnimationMode.StartAnimationMode();
                AnimationMode.BeginSampling();
                AnimationMode.SampleAnimationClip(animator.gameObject, idle, 1.2f);
                AnimationMode.EndSampling();
                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning("SUNBREAK_SHOT: idle pose sampling failed: " + e.Message);
                return false;
            }
        }

        static void CaptureGreybox()
        {
            EditorSceneManager.OpenScene(SunbreakPaths.ScenePath, OpenSceneMode.Single);
            Directory.CreateDirectory(SunbreakPaths.ShotsDir);
            Camera cam = GetCamera();
            Vector3 focus = FindPos("Player", new Vector3(0f, 1f, 0f)) + Vector3.up;
            string a = Shoot(cam, "greybox_establishing.png", focus + new Vector3(34f, 26f, 40f), focus, SunbreakPaths.ShotsDir);
            string b = Shoot(cam, "greybox_thirdperson.png", focus + new Vector3(-6.5f, 4.5f, -10.5f), focus, SunbreakPaths.ShotsDir);
            Debug.Log($"SUNBREAK_SHOT_OK: {a} | {b}");
        }

        static Camera GetCamera()
        {
            Camera cam = Camera.main ?? UnityEngine.Object.FindFirstObjectByType<Camera>();
            if (cam == null) throw new Exception("No camera in the scene.");
            return cam;
        }

        static Vector3 FindPos(string name, Vector3 fallback)
        {
            var go = GameObject.Find(name);
            return go != null ? go.transform.position : fallback;
        }

        static string Shoot(Camera cam, string file, Vector3 pos, Vector3 lookAt, string dir = null)
        {
            dir ??= SunbreakPaths.Slice1ShotsDir;
            cam.transform.position = pos;
            cam.transform.rotation = Quaternion.LookRotation((lookAt - pos).normalized, Vector3.up);
            string path = Path.Combine(dir, file);
            RenderToPng(cam, path);
            return path;
        }

        static string ShootOrtho(Camera cam, string file, Vector3 pos, float orthoSize, string dir)
        {
            bool prevOrtho = cam.orthographic;
            float prevSize = cam.orthographicSize;
            cam.orthographic = true;
            cam.orthographicSize = orthoSize;
            cam.transform.position = pos;
            cam.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            string path = Path.Combine(dir, file);
            RenderToPng(cam, path);
            cam.orthographic = prevOrtho;
            cam.orthographicSize = prevSize;
            return path;
        }

        static void RenderToPng(Camera cam, string path)
        {
            var rt = new RenderTexture(Width, Height, 24, RenderTextureFormat.ARGB32) { antiAliasing = 1 };
            RenderTexture prevTarget = cam.targetTexture;
            RenderTexture prevActive = RenderTexture.active;
            float prevAspect = cam.aspect;

            cam.targetTexture = rt;
            cam.aspect = (float)Width / Height;
            cam.Render();

            RenderTexture.active = rt;
            var tex = new Texture2D(Width, Height, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, Width, Height), 0, 0);
            tex.Apply();

            cam.targetTexture = prevTarget;
            cam.aspect = prevAspect;
            RenderTexture.active = prevActive;

            File.WriteAllBytes(path, tex.EncodeToPNG());
            UnityEngine.Object.DestroyImmediate(tex);
            rt.Release();
            UnityEngine.Object.DestroyImmediate(rt);
        }
    }
}
