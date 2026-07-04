using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
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
                    CaptureIsland();
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
