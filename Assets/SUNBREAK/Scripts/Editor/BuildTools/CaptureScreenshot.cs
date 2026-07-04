using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace SUNBREAK.BuildTools
{
    /// <summary>
    /// Opens the greybox scene and renders the main camera to PNG files under
    /// <c>./BuildLogs/shots/</c>, headlessly. Positions the camera for a couple of framings so
    /// the greybox can be eyeballed without launching the editor. Invoke with
    /// <c>-executeMethod SUNBREAK.BuildTools.CaptureScreenshot.Capture</c>.
    /// </summary>
    public static class CaptureScreenshot
    {
        const int Width = 1920;
        const int Height = 1080;

        public static void Capture()
        {
            try
            {
                if (!File.Exists(SunbreakPaths.ScenePath))
                    throw new Exception("Greybox scene not found at " + SunbreakPaths.ScenePath);

                EditorSceneManager.OpenScene(SunbreakPaths.ScenePath, OpenSceneMode.Single);
                Directory.CreateDirectory(SunbreakPaths.ShotsDir);

                Camera cam = Camera.main;
                if (cam == null) cam = UnityEngine.Object.FindFirstObjectByType<Camera>();
                if (cam == null) throw new Exception("No camera in the greybox scene.");

                // The CinemachineBrain does not tick in a synchronous -executeMethod call, so we
                // place the camera directly for deterministic framings.
                var playerGo = GameObject.Find("Player");
                Vector3 focus = playerGo != null
                    ? playerGo.transform.position + Vector3.up * 1.0f
                    : new Vector3(0f, 1f, 0f);

                string shot1 = Path.Combine(SunbreakPaths.ShotsDir, "greybox_establishing.png");
                Frame(cam, focus, new Vector3(34f, 26f, 40f));
                RenderToPng(cam, shot1);

                string shot2 = Path.Combine(SunbreakPaths.ShotsDir, "greybox_thirdperson.png");
                Frame(cam, focus, new Vector3(-6.5f, 4.5f, -10.5f));
                RenderToPng(cam, shot2);

                Debug.Log($"SUNBREAK_SHOT_OK: {shot1} | {shot2}");
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

        static void Frame(Camera cam, Vector3 focus, Vector3 offset)
        {
            Vector3 pos = focus + offset;
            cam.transform.position = pos;
            cam.transform.rotation = Quaternion.LookRotation((focus - pos).normalized, Vector3.up);
        }

        static void RenderToPng(Camera cam, string path)
        {
            var rt = new RenderTexture(Width, Height, 24, RenderTextureFormat.ARGB32)
            {
                antiAliasing = 1
            };
            RenderTexture prevTarget = cam.targetTexture;
            RenderTexture prevActive = RenderTexture.active;

            cam.targetTexture = rt;
            cam.Render();

            RenderTexture.active = rt;
            var tex = new Texture2D(Width, Height, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, Width, Height), 0, 0);
            tex.Apply();

            cam.targetTexture = prevTarget;
            RenderTexture.active = prevActive;

            File.WriteAllBytes(path, tex.EncodeToPNG());

            UnityEngine.Object.DestroyImmediate(tex);
            rt.Release();
            UnityEngine.Object.DestroyImmediate(rt);
        }
    }
}
