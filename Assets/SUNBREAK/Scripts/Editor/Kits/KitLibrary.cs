using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace SUNBREAK.EditorTools.Kits
{
    /// <summary>
    /// Editor-side loader for the CC0 Kenney kits. Resolves FBX models by name, assigns the
    /// single shared per-kit material (colormap atlas, or the vertex-colour shader for the
    /// Nature kit), and fits/places instances by their measured render bounds so the
    /// generator can lay out a street without hard-coding any model's authored scale. This is
    /// where the "one art family = cohesion" guarantee is enforced.
    /// </summary>
    public static class KitLibrary
    {
        public const string KenneyRoot = "Assets/SUNBREAK/Art/Kits/Kenney";
        public const string CarKit = KenneyRoot + "/kenney_car-kit/Models/FBX format";
        public const string CommercialKit = KenneyRoot + "/kenney_city-kit-commercial/Models/FBX format";
        public const string RoadsKit = KenneyRoot + "/kenney_city-kit-roads/Models/FBX format";
        public const string NatureKit = KenneyRoot + "/kenney_nature-kit/Models/FBX format";
        public const string BlasterKit = KenneyRoot + "/kenney_blaster-kit/Models/FBX format";

        const string KitMatDir = "Assets/SUNBREAK/Art/Materials/Kits";

        static readonly Dictionary<string, Material> _matCache = new();

        // ── Models ───────────────────────────────────────────────────────────
        public static string ModelPath(string kitDir, string name) => $"{kitDir}/{name}.fbx";

        public static bool Has(string kitDir, string name) =>
            File.Exists(ModelPath(kitDir, name));

        /// <summary>True if the kit ships a shared colormap atlas (car/city) vs per-material (nature).</summary>
        public static bool HasColormap(string kitDir) => File.Exists($"{kitDir}/Textures/colormap.png");

        public static GameObject LoadModel(string kitDir, string name)
        {
            var go = AssetDatabase.LoadAssetAtPath<GameObject>(ModelPath(kitDir, name));
            if (go == null) Debug.LogWarning($"[KitLibrary] missing model {kitDir}/{name}.fbx");
            return go;
        }

        /// <summary>Instantiate a kit model into the scene with its shared kit material applied.</summary>
        public static GameObject Instantiate(string kitDir, string name, Transform parent)
        {
            var model = LoadModel(kitDir, name);
            if (model == null) return null;
            var go = (GameObject)PrefabUtility.InstantiatePrefab(model);
            if (parent != null) go.transform.SetParent(parent, false);
            go.name = name;
            // Atlas kits get the single shared cohesive material; per-material kits (nature)
            // keep their imported URP materials so their authored colours survive.
            if (HasColormap(kitDir)) ApplyKitMaterial(go, GetKitMaterial(kitDir));
            return go;
        }

        // ── Shared materials ───────────────────────────────────────────────────
        public static Material GetKitMaterial(string kitDir)
        {
            if (_matCache.TryGetValue(kitDir, out var cached) && cached != null) return cached;

            EnsureFolder(KitMatDir);
            string leaf = LeafName(kitDir);
            string matPath = $"{KitMatDir}/{leaf}.mat";
            string colormap = $"{kitDir}/Textures/colormap.png";
            bool hasColormap = File.Exists(colormap);

            var mat = AssetDatabase.LoadAssetAtPath<Material>(matPath);
            if (mat == null)
            {
                Shader shader = hasColormap
                    ? Shader.Find("Universal Render Pipeline/Lit")
                    : (Shader.Find("SUNBREAK/VertexColorLit") ?? Shader.Find("Universal Render Pipeline/Lit"));
                mat = new Material(shader) { name = leaf };
                AssetDatabase.CreateAsset(mat, matPath);
            }

            if (hasColormap)
            {
                var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(colormap);
                if (tex != null)
                {
                    mat.SetTexture("_BaseMap", tex);
                    mat.SetTexture("_MainTex", tex);
                }
                mat.SetColor("_BaseColor", Color.white);
                if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 0.12f);
                if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", 0f);
                if (mat.HasProperty("_SpecularHighlights")) mat.SetFloat("_SpecularHighlights", 0f);
            }
            else if (mat.HasProperty("_Smoothness"))
            {
                mat.SetFloat("_Smoothness", 0.06f);
            }

            EditorUtility.SetDirty(mat);
            _matCache[kitDir] = mat;
            return mat;
        }

        static void ApplyKitMaterial(GameObject go, Material mat)
        {
            if (mat == null) return;
            foreach (var mr in go.GetComponentsInChildren<MeshRenderer>(true))
            {
                var mf = mr.GetComponent<MeshFilter>();
                int subs = mf != null && mf.sharedMesh != null ? Mathf.Max(1, mf.sharedMesh.subMeshCount) : 1;
                var mats = new Material[subs];
                for (int i = 0; i < subs; i++) mats[i] = mat;
                mr.sharedMaterials = mats;
            }
        }

        // ── Bounds & fitting ───────────────────────────────────────────────────
        /// <summary>Combined world-space renderer bounds (empty if none).</summary>
        public static Bounds WorldBounds(GameObject go)
        {
            var rends = go.GetComponentsInChildren<Renderer>();
            if (rends.Length == 0) return new Bounds(go.transform.position, Vector3.zero);
            Bounds b = rends[0].bounds;
            for (int i = 1; i < rends.Length; i++) b.Encapsulate(rends[i].bounds);
            return b;
        }

        /// <summary>
        /// Uniformly scale <paramref name="go"/> so its height matches <paramref name="targetHeight"/>,
        /// then sit it on <paramref name="groundY"/> centred at (x,z). Returns the placed world bounds.
        /// </summary>
        public static Bounds FitByHeight(GameObject go, float x, float z, float groundY, float targetHeight,
            float yawDeg = 0f)
        {
            go.transform.SetPositionAndRotation(Vector3.zero, Quaternion.Euler(0f, yawDeg, 0f));
            go.transform.localScale = Vector3.one;
            Bounds b = WorldBounds(go);
            float h = Mathf.Max(0.001f, b.size.y);
            float scale = targetHeight / h;
            go.transform.localScale = Vector3.one * scale;

            b = WorldBounds(go);
            Vector3 pos = go.transform.position;
            pos.x += x - b.center.x;
            pos.z += z - b.center.z;
            pos.y += groundY - b.min.y;
            go.transform.position = pos;
            return WorldBounds(go);
        }

        /// <summary>Scale to a target longest-horizontal size (for cars/props), sit on ground.</summary>
        public static Bounds FitByLength(GameObject go, float x, float z, float groundY, float targetLength,
            float yawDeg = 0f)
        {
            go.transform.SetPositionAndRotation(Vector3.zero, Quaternion.Euler(0f, yawDeg, 0f));
            go.transform.localScale = Vector3.one;
            Bounds b = WorldBounds(go);
            float len = Mathf.Max(b.size.x, b.size.z, 0.001f);
            float scale = targetLength / len;
            go.transform.localScale = Vector3.one * scale;

            b = WorldBounds(go);
            Vector3 pos = go.transform.position;
            pos.x += x - b.center.x;
            pos.z += z - b.center.z;
            pos.y += groundY - b.min.y;
            go.transform.position = pos;
            return WorldBounds(go);
        }

        // ── Helpers ────────────────────────────────────────────────────────────
        static string LeafName(string kitDir)
        {
            // ".../kenney_car-kit/Models/FBX format" → "kenney_car-kit"
            string[] parts = kitDir.Split('/');
            for (int i = parts.Length - 1; i >= 0; i--)
                if (parts[i].StartsWith("kenney_")) return parts[i];
            return parts.Length > 0 ? parts[^1] : "kit";
        }

        static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            string leaf = Path.GetFileName(path);
            if (!AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, leaf);
        }

        public static void ClearCache() => _matCache.Clear();
    }
}
