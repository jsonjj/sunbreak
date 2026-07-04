using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using SUNBREAK.EditorTools.Characters;

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
                if (File.Exists(SunbreakPaths.HeroScenePath))
                    CaptureHero();
                else if (File.Exists(SunbreakPaths.ScenePath))
                    CaptureGreybox();
                else
                    throw new Exception("No scene found (hero or greybox).");

                EditorApplication.Exit(0);
            }
            catch (Exception e)
            {
                Debug.LogError("SUNBREAK_SHOT_FAIL: " + e);
                EditorApplication.Exit(1);
            }
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
                Transform charT = player != null ? player.transform.Find("Character") : null;
                if (charT == null) return false;

                AnimationClip idle = null;
                foreach (var guid in AssetDatabase.FindAssets("t:AnimationClip", new[] { HumanoidAnimatorSetup.MixamoDir }))
                {
                    string p = AssetDatabase.GUIDToAssetPath(guid);
                    if (!p.ToLowerInvariant().Contains("idle")) continue;
                    foreach (var o in AssetDatabase.LoadAllAssetsAtPath(p))
                        if (o is AnimationClip c && !c.name.StartsWith("__preview")) { idle = c; break; }
                    if (idle != null) break;
                }
                if (idle == null) return false;

                AnimationMode.StartAnimationMode();
                AnimationMode.BeginSampling();
                AnimationMode.SampleAnimationClip(charT.gameObject, idle, 1.2f);
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
