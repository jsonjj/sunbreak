using System;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using Unity.Cinemachine;
using SUNBREAK.BuildTools;
using SUNBREAK.Cameras;
using SUNBREAK.Player;
using SUNBREAK.World;

namespace SUNBREAK.EditorTools
{
    /// <summary>
    /// Generates the Slice 0 greybox scene entirely in code (no hand placement): a big ground
    /// plane, a warm URP directional sun with soft shadows, a global post Volume
    /// (tonemapping / bloom / color / vignette), a scatter of reference blocks for depth &amp;
    /// shadow read, and a player capsule with the minimal controller driven by a Cinemachine
    /// third-person orbital camera. Idempotent: safe to re-run. Invoke headlessly via
    /// <c>-executeMethod SUNBREAK.EditorTools.GreyboxSceneBuilder.Build</c>.
    /// </summary>
    public static class GreyboxSceneBuilder
    {
        const string ArtDir = "Assets/SUNBREAK/Art";
        const string MatDir = ArtDir + "/Materials";
        const string SettingsDir = "Assets/SUNBREAK/Settings";
        const string VolumeProfilePath = SettingsDir + "/GreyboxVolumeProfile.asset";

        // ── Headless entry point ─────────────────────────────────────────────
        public static void Build()
        {
            try
            {
                BuildInternal();
                Debug.Log("SUNBREAK_GREYBOX_OK: " + SunbreakPaths.ScenePath);
                EditorApplication.Exit(0);
            }
            catch (Exception e)
            {
                Debug.LogError("SUNBREAK_GREYBOX_FAIL: " + e);
                EditorApplication.Exit(1);
            }
        }

        [MenuItem("SUNBREAK/Rebuild Greybox Scene")]
        public static void BuildMenu()
        {
            BuildInternal();
            EditorUtility.DisplayDialog("SUNBREAK", "Greybox scene rebuilt:\n" + SunbreakPaths.ScenePath, "OK");
        }

        static void BuildInternal()
        {
            EnsureFolder("Assets/SUNBREAK", "Art");
            EnsureFolder(ArtDir, "Materials");
            EnsureFolder("Assets/SUNBREAK", "Scenes");
            EnsureFolder("Assets/SUNBREAK", "Settings");

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            ConfigureEnvironment();

            Material groundMat = CreateLitMaterial("GreyboxGround", new Color(0.28f, 0.30f, 0.33f), 0f, 0.10f);
            Material gridMat = CreateLitMaterial("GreyboxGrid", new Color(0.20f, 0.22f, 0.25f), 0f, 0.05f);
            Material blockMat = CreateLitMaterial("GreyboxBlock", new Color(0.55f, 0.56f, 0.58f), 0f, 0.15f);
            Material accentMat = CreateLitMaterial("GreyboxAccent", new Color(0.22f, 0.45f, 0.72f), 0f, 0.25f);
            Material playerMat = CreateLitMaterial("GreyboxPlayer", new Color(0.96f, 0.55f, 0.16f), 0f, 0.30f);

            CreateSun();
            CreateGround(groundMat, gridMat);
            CreateReferenceBlocks(blockMat, accentMat);

            PlayerController player = CreatePlayer(playerMat, out Transform camTarget);
            CreateCameraAndRig(player, camTarget);
            CreateVolume();

            EditorSceneManager.MarkSceneDirty(scene);
            bool saved = EditorSceneManager.SaveScene(scene, SunbreakPaths.ScenePath);
            if (!saved)
                throw new Exception("Failed to save scene to " + SunbreakPaths.ScenePath);

            SetAsFirstBuildScene(SunbreakPaths.ScenePath);
            // NOTE: SSAO is intentionally not injected here. The URP "Universal 3D" template
            // already ships a ScreenSpaceAmbientOcclusion renderer feature on the active
            // PC_Renderer, so ambient occlusion is on out of the box. (Programmatically adding
            // renderer features risked touching the Mobile renderer and immutable package data.)

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
        }

        // ── Environment (ambient, fog) ───────────────────────────────────────
        static void ConfigureEnvironment()
        {
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.56f, 0.63f, 0.74f);
            RenderSettings.ambientEquatorColor = new Color(0.42f, 0.43f, 0.46f);
            RenderSettings.ambientGroundColor = new Color(0.16f, 0.16f, 0.18f);
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = new Color(0.62f, 0.68f, 0.77f);
            RenderSettings.fogStartDistance = 70f;
            RenderSettings.fogEndDistance = 520f;
        }

        static void CreateSun()
        {
            var go = new GameObject("Directional Light (Sun)");
            var light = go.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = new Color(1f, 0.95f, 0.86f);
            light.intensity = 1.6f;
            light.shadows = LightShadows.Soft;
            light.shadowStrength = 0.75f;
            go.transform.rotation = Quaternion.Euler(46f, -34f, 0f);
            RenderSettings.sun = light;
        }

        static void CreateGround(Material groundMat, Material gridMat)
        {
            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Ground";
            ground.transform.localScale = new Vector3(130f, 1f, 130f); // 1300 x 1300 m
            ground.GetComponent<MeshRenderer>().sharedMaterial = groundMat;
            GameObjectUtility.SetStaticEditorFlags(ground, StaticEditorFlags.BatchingStatic | StaticEditorFlags.ContributeGI);

            // A subtle raised grid frame so scale/motion reads in screenshots.
            var frame = new GameObject("GroundGrid").transform;
            const int lines = 8;
            const float span = 120f;
            const float step = span * 2f / lines;
            for (int i = 0; i <= lines; i++)
            {
                float p = -span + i * step;
                MakeStrip(frame, gridMat, new Vector3(0f, 0.02f, p), new Vector3(span * 2f, 0.04f, 0.6f));
                MakeStrip(frame, gridMat, new Vector3(p, 0.02f, 0f), new Vector3(0.6f, 0.04f, span * 2f));
            }
        }

        static void MakeStrip(Transform parent, Material mat, Vector3 pos, Vector3 scale)
        {
            var s = GameObject.CreatePrimitive(PrimitiveType.Cube);
            s.name = "grid";
            Component col = s.GetComponent<Collider>();
            if (col != null) UnityEngine.Object.DestroyImmediate(col);
            s.transform.SetParent(parent, false);
            s.transform.localPosition = pos;
            s.transform.localScale = scale;
            s.GetComponent<MeshRenderer>().sharedMaterial = mat;
        }

        static void CreateReferenceBlocks(Material blockMat, Material accentMat)
        {
            var parent = new GameObject("GreyboxBlocks").transform;
            var rng = new System.Random(0x5A17A01E);
            for (int gx = -4; gx <= 4; gx++)
            {
                for (int gz = -4; gz <= 4; gz++)
                {
                    if (Mathf.Abs(gx) <= 1 && Mathf.Abs(gz) <= 1) continue; // keep the spawn plaza clear
                    if (rng.NextDouble() < 0.30) continue;                  // some empty lots

                    float x = gx * 24f + (float)(rng.NextDouble() * 6 - 3);
                    float z = gz * 24f + (float)(rng.NextDouble() * 6 - 3);
                    float h = 4f + (float)(rng.NextDouble() * rng.NextDouble() * 26f);
                    float w = 7f + (float)(rng.NextDouble() * 7f);
                    float d = 7f + (float)(rng.NextDouble() * 7f);

                    var box = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    box.name = $"Block_{gx}_{gz}";
                    box.transform.SetParent(parent, false);
                    box.transform.position = new Vector3(x, h * 0.5f, z);
                    box.transform.localScale = new Vector3(w, h, d);
                    box.GetComponent<MeshRenderer>().sharedMaterial = (rng.NextDouble() < 0.18) ? accentMat : blockMat;
                    GameObjectUtility.SetStaticEditorFlags(box, StaticEditorFlags.BatchingStatic | StaticEditorFlags.ContributeGI);
                }
            }
        }

        static PlayerController CreatePlayer(Material playerMat, out Transform camTarget)
        {
            var player = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            player.name = "Player";
            player.tag = "Player";
            Collider primitiveCol = player.GetComponent<Collider>();
            if (primitiveCol != null) UnityEngine.Object.DestroyImmediate(primitiveCol);
            player.transform.position = new Vector3(0f, 1.02f, 0f);
            player.GetComponent<MeshRenderer>().sharedMaterial = playerMat;

            var cc = player.AddComponent<CharacterController>();
            cc.height = 2f;
            cc.radius = 0.5f;
            cc.center = Vector3.zero;
            cc.slopeLimit = 50f;
            cc.stepOffset = 0.4f;

            var controller = player.AddComponent<PlayerController>();

            var target = new GameObject("CameraTarget").transform;
            target.SetParent(player.transform, false);
            target.localPosition = new Vector3(0f, 0.6f, 0f);
            camTarget = target;

            return controller;
        }

        static void CreateCameraAndRig(PlayerController player, Transform camTarget)
        {
            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 1500f;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.60f, 0.68f, 0.80f);

            var camData = cam.GetUniversalAdditionalCameraData();
            camData.renderPostProcessing = true;
            camData.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;

            camGo.AddComponent<CinemachineBrain>();
            camGo.transform.position = new Vector3(-7f, 5.5f, -11f);
            camGo.transform.rotation = Quaternion.LookRotation(
                (camTarget.position - camGo.transform.position).normalized, Vector3.up);

            var vcamGo = new GameObject("CM ThirdPerson");
            var vcam = vcamGo.AddComponent<CinemachineCamera>();
            vcam.Follow = camTarget;
            vcam.LookAt = camTarget;
            vcam.Lens.FieldOfView = 55f;

            var orbital = vcamGo.AddComponent<CinemachineOrbitalFollow>();
            orbital.OrbitStyle = CinemachineOrbitalFollow.OrbitStyles.Sphere;
            orbital.Radius = 6.5f;
            orbital.HorizontalAxis.Range = new Vector2(-180f, 180f);
            orbital.HorizontalAxis.Wrap = true;
            orbital.HorizontalAxis.Center = 0f;
            orbital.HorizontalAxis.Value = 0f;
            orbital.VerticalAxis.Range = new Vector2(-25f, 65f);
            orbital.VerticalAxis.Wrap = false;
            orbital.VerticalAxis.Center = 18f;
            orbital.VerticalAxis.Value = 14f;

            vcamGo.AddComponent<CinemachineRotationComposer>();

            var rig = vcamGo.AddComponent<ThirdPersonCameraRig>();
            rig.player = player;
            rig.orbital = orbital;
        }

        static void CreateVolume()
        {
            AssetDatabase.DeleteAsset(VolumeProfilePath);
            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            AssetDatabase.CreateAsset(profile, VolumeProfilePath);

            var tone = profile.Add<Tonemapping>(true);
            tone.mode.overrideState = true;
            tone.mode.value = TonemappingMode.Neutral;

            var bloom = profile.Add<Bloom>(true);
            bloom.intensity.overrideState = true;
            bloom.intensity.value = 0.65f;
            bloom.threshold.overrideState = true;
            bloom.threshold.value = 1.05f;

            var color = profile.Add<ColorAdjustments>(true);
            color.postExposure.overrideState = true;
            color.postExposure.value = 0.15f;
            color.contrast.overrideState = true;
            color.contrast.value = 10f;
            color.saturation.overrideState = true;
            color.saturation.value = 6f;

            var vignette = profile.Add<Vignette>(true);
            vignette.intensity.overrideState = true;
            vignette.intensity.value = 0.26f;
            vignette.smoothness.overrideState = true;
            vignette.smoothness.value = 0.4f;

            EditorUtility.SetDirty(profile);

            var volGo = new GameObject("Global Volume");
            var vol = volGo.AddComponent<Volume>();
            vol.isGlobal = true;
            vol.priority = 0f;
            vol.sharedProfile = profile;
        }

        // ── Helpers ──────────────────────────────────────────────────────────
        static Material CreateLitMaterial(string name, Color baseColor, float metallic, float smoothness)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) shader = Shader.Find("Standard");
            var m = new Material(shader) { name = name };
            m.SetColor("_BaseColor", baseColor);
            m.SetColor("_Color", baseColor);
            if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metallic);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smoothness);
            string path = MatDir + "/" + name + ".mat";
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(m, path);
            return m;
        }

        static void EnsureFolder(string parent, string child)
        {
            if (!AssetDatabase.IsValidFolder(parent + "/" + child))
                AssetDatabase.CreateFolder(parent, child);
        }

        static void SetAsFirstBuildScene(string scenePath)
        {
            var scenes = new System.Collections.Generic.List<EditorBuildSettingsScene>();
            scenes.Add(new EditorBuildSettingsScene(scenePath, true));
            foreach (var s in EditorBuildSettings.scenes)
                if (s.path != scenePath)
                    scenes.Add(s);
            EditorBuildSettings.scenes = scenes.ToArray();
        }
    }
}
