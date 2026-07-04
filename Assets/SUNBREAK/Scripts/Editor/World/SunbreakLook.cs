using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace SUNBREAK.EditorTools.World
{
    /// <summary>
    /// The "look" module — the single biggest lever for an AAA feel per the plan. Sets the
    /// Poly Haven HDRI as sky + ambient + reflection source, a warm golden-hour key light
    /// with soft shadows, atmospheric fog, and a URP post Volume (ACES tonemapping, bloom,
    /// warm colour grade, vignette). SSAO is already a renderer feature on PC_Renderer.
    /// Also builds the ambientCG PBR ground materials (asphalt / paving) for road + kerbs.
    /// </summary>
    public static class SunbreakLook
    {
        const string HdriPath = "Assets/SUNBREAK/Art/Environment/HDRI/kloofendal_puresky_4k.hdr";
        const string TexRoot = "Assets/SUNBREAK/Art/Environment/Textures";
        const string SettingsDir = "Assets/SUNBREAK/Settings";
        const string MatDir = "Assets/SUNBREAK/Art/Materials";
        public const string VolumeProfilePath = SettingsDir + "/HeroVolumeProfile.asset";
        const string SkyMatPath = SettingsDir + "/HeroSky.mat";

        // ── Sky + image-based lighting ─────────────────────────────────────────
        public static void SetupSky()
        {
            var hdr = ConfigureHdrCubemap();
            var skyMat = AssetDatabase.LoadAssetAtPath<Material>(SkyMatPath);
            Shader skyShader = Shader.Find("Skybox/Cubemap");
            if (skyMat == null && skyShader != null)
            {
                skyMat = new Material(skyShader);
                AssetDatabase.CreateAsset(skyMat, SkyMatPath);
            }
            if (skyMat != null)
            {
                if (hdr != null) skyMat.SetTexture("_Tex", hdr);
                skyMat.SetFloat("_Exposure", 0.95f);
                skyMat.SetFloat("_Rotation", 200f); // aim the HDRI's bright side down the street
                EditorUtility.SetDirty(skyMat);
                RenderSettings.skybox = skyMat;
            }

            RenderSettings.ambientMode = AmbientMode.Skybox;
            RenderSettings.ambientIntensity = 0.85f;
            RenderSettings.defaultReflectionMode = DefaultReflectionMode.Skybox;
            RenderSettings.defaultReflectionResolution = 256;
            RenderSettings.reflectionIntensity = 1.0f;
            DynamicGI.UpdateEnvironment();
        }

        static Cubemap ConfigureHdrCubemap()
        {
            if (!File.Exists(HdriPath)) { Debug.LogWarning("[SunbreakLook] HDRI missing: " + HdriPath); return null; }
            var ti = (TextureImporter)AssetImporter.GetAtPath(HdriPath);
            if (ti != null)
            {
                bool dirty = false;
                if (ti.textureShape != TextureImporterShape.TextureCube) { ti.textureShape = TextureImporterShape.TextureCube; dirty = true; }
                if (ti.generateCubemap != TextureImporterGenerateCubemap.Cylindrical) { ti.generateCubemap = TextureImporterGenerateCubemap.Cylindrical; dirty = true; }
                if (ti.sRGBTexture) { ti.sRGBTexture = false; dirty = true; }
                if (ti.mipmapEnabled) { ti.mipmapEnabled = true; }
                if (dirty) { ti.SaveAndReimport(); }
            }
            return AssetDatabase.LoadAssetAtPath<Cubemap>(HdriPath);
        }

        // ── Golden-hour key light ──────────────────────────────────────────────
        public static Light CreateSun()
        {
            var go = new GameObject("Directional Light (Golden Hour Sun)");
            var light = go.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = new Color(1f, 0.79f, 0.55f);   // warm low sun
            light.intensity = 1.5f;
            light.shadows = LightShadows.Soft;
            light.shadowStrength = 0.85f;
            light.shadowBias = 0.05f;
            light.shadowNormalBias = 0.4f;
            // Low elevation raking in from the side (street runs N–S) for long dramatic shadows.
            go.transform.rotation = Quaternion.Euler(15f, 66f, 0f);
            RenderSettings.sun = light;
            return light;
        }

        // ── Atmosphere ─────────────────────────────────────────────────────────
        public static void ConfigureFog()
        {
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = new Color(0.80f, 0.72f, 0.62f); // warm haze
            RenderSettings.fogStartDistance = 45f;
            RenderSettings.fogEndDistance = 420f;
        }

        // ── Post-processing Volume ─────────────────────────────────────────────
        public static void CreateVolume()
        {
            EnsureFolder(SettingsDir);
            AssetDatabase.DeleteAsset(VolumeProfilePath);
            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            AssetDatabase.CreateAsset(profile, VolumeProfilePath);

            var tone = profile.Add<Tonemapping>(true);
            tone.mode.overrideState = true;
            tone.mode.value = TonemappingMode.ACES;

            var bloom = profile.Add<Bloom>(true);
            bloom.intensity.overrideState = true; bloom.intensity.value = 0.85f;
            bloom.threshold.overrideState = true; bloom.threshold.value = 0.9f;
            bloom.scatter.overrideState = true; bloom.scatter.value = 0.62f;
            bloom.tint.overrideState = true; bloom.tint.value = new Color(1f, 0.93f, 0.82f);

            var color = profile.Add<ColorAdjustments>(true);
            color.postExposure.overrideState = true; color.postExposure.value = 0.25f;
            color.contrast.overrideState = true; color.contrast.value = 14f;
            color.saturation.overrideState = true; color.saturation.value = 8f;
            color.colorFilter.overrideState = true; color.colorFilter.value = new Color(1f, 0.96f, 0.90f);

            var wb = profile.Add<WhiteBalance>(true);
            wb.temperature.overrideState = true; wb.temperature.value = 16f;  // warmer
            wb.tint.overrideState = true; wb.tint.value = 3f;

            var smh = profile.Add<ShadowsMidtonesHighlights>(true);
            smh.shadows.overrideState = true; smh.shadows.value = new Vector4(0.95f, 0.98f, 1.08f, 0f);   // cool shadows
            smh.highlights.overrideState = true; smh.highlights.value = new Vector4(1.08f, 1.02f, 0.9f, 0f); // warm highlights

            var vignette = profile.Add<Vignette>(true);
            vignette.intensity.overrideState = true; vignette.intensity.value = 0.30f;
            vignette.smoothness.overrideState = true; vignette.smoothness.value = 0.4f;

            EditorUtility.SetDirty(profile);

            var volGo = new GameObject("Global Volume");
            var vol = volGo.AddComponent<Volume>();
            vol.isGlobal = true;
            vol.priority = 1f;
            vol.sharedProfile = profile;
        }

        // ── ambientCG PBR ground materials ─────────────────────────────────────
        public static void ConfigureGroundTextureImporters()
        {
            SetImporter($"{TexRoot}/Asphalt025A/Asphalt025A_2K-JPG_NormalGL.jpg", TextureImporterType.NormalMap);
            SetImporter($"{TexRoot}/Asphalt025A/Asphalt025A_2K-JPG_AmbientOcclusion.jpg", TextureImporterType.Default, linear: true);
            SetImporter($"{TexRoot}/PavingStones128/PavingStones128_2K-JPG_NormalGL.jpg", TextureImporterType.NormalMap);
            SetImporter($"{TexRoot}/PavingStones128/PavingStones128_2K-JPG_AmbientOcclusion.jpg", TextureImporterType.Default, linear: true);
        }

        static void SetImporter(string path, TextureImporterType type, bool linear = false)
        {
            if (!File.Exists(path)) return;
            var ti = (TextureImporter)AssetImporter.GetAtPath(path);
            if (ti == null) return;
            bool dirty = false;
            if (ti.textureType != type) { ti.textureType = type; dirty = true; }
            if (type == TextureImporterType.Default && ti.sRGBTexture == linear) { ti.sRGBTexture = !linear; dirty = true; }
            if (dirty) ti.SaveAndReimport();
        }

        /// <summary>URP Lit ground material from an ambientCG set (Color + NormalGL + AO), tiled.</summary>
        public static Material MakePbrGround(string name, string folder, string prefix, Vector2 tiling,
            float smoothness)
        {
            EnsureFolder(MatDir);
            string path = $"{MatDir}/{name}.mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            Shader lit = Shader.Find("Universal Render Pipeline/Lit");
            if (mat == null) { mat = new Material(lit) { name = name }; AssetDatabase.CreateAsset(mat, path); }
            else mat.shader = lit;

            var col = AssetDatabase.LoadAssetAtPath<Texture2D>($"{folder}/{prefix}_Color.jpg");
            var nrm = AssetDatabase.LoadAssetAtPath<Texture2D>($"{folder}/{prefix}_NormalGL.jpg");
            var ao = AssetDatabase.LoadAssetAtPath<Texture2D>($"{folder}/{prefix}_AmbientOcclusion.jpg");

            if (col != null) { mat.SetTexture("_BaseMap", col); mat.SetTextureScale("_BaseMap", tiling); }
            if (nrm != null)
            {
                mat.EnableKeyword("_NORMALMAP");
                mat.SetTexture("_BumpMap", nrm);
                mat.SetTextureScale("_BumpMap", tiling);
                mat.SetFloat("_BumpScale", 1f);
            }
            if (ao != null)
            {
                mat.EnableKeyword("_OCCLUSIONMAP");
                mat.SetTexture("_OcclusionMap", ao);
                mat.SetTextureScale("_OcclusionMap", tiling);
                mat.SetFloat("_OcclusionStrength", 1f);
            }
            mat.SetColor("_BaseColor", Color.white);
            mat.SetFloat("_Smoothness", smoothness);
            mat.SetFloat("_Metallic", 0f);
            EditorUtility.SetDirty(mat);
            return mat;
        }

        static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            string leaf = Path.GetFileName(path);
            if (!AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, leaf);
        }
    }
}
