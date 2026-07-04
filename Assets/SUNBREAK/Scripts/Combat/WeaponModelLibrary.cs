using System.Collections.Generic;
using UnityEngine;

namespace SUNBREAK.Combat
{
    /// <summary>
    /// Runtime registry of visible weapon models (Kenney Blaster Kit, CC0). Maps a combat weapon id
    /// to a prefab + a hold transform + a muzzle offset + an animator WeaponType (0 unarmed / 1 pistol
    /// / 2 rifle), and attaches a fitted instance to a character's right hand. Blaster prefabs are
    /// wired by IslandSceneBuilder. Grip alignment is approximate and tuned for the Mixamo hand — it
    /// looks correct with the armed hold clips; expect to nudge the per-weapon offsets in play.
    /// </summary>
    public sealed class WeaponModelLibrary : MonoBehaviour
    {
        public static WeaponModelLibrary Instance { get; private set; }

        [Header("Blaster prefabs (wired by IslandSceneBuilder)")]
        public GameObject pistol, smg, shotgun, rifle, sniper, rpg, grenade;
        public Material material; // shared Kenney colormap material

        sealed class Entry
        {
            public GameObject prefab;
            public float length;      // fit the model's longest dimension to this (m)
            public int weaponType;    // 0 unarmed, 1 pistol, 2 rifle
        }

        readonly Dictionary<string, Entry> _map = new();

        void Awake()
        {
            Instance = this;
            Add("pistol_9mm", pistol, 0.28f, 1);
            Add("smg_vector", smg, 0.5f, 2);
            Add("shotgun_pump", shotgun, 0.7f, 2);
            Add("rifle_carbine", rifle, 0.75f, 2);
            Add("sniper_bolt", sniper, 0.9f, 2);
            Add("launcher_rpg", rpg, 1.0f, 2);
            Add("grenade", grenade, 0.12f, 0);
        }
        void OnDestroy() { if (Instance == this) Instance = null; }

        void Add(string id, GameObject prefab, float length, int weaponType)
        {
            if (prefab != null) _map[id] = new Entry { prefab = prefab, length = length, weaponType = weaponType };
        }

        public int WeaponTypeFor(string id) => _map.TryGetValue(id, out var e) ? e.weaponType : 0;
        public bool Has(string id) => _map.ContainsKey(id);

        /// <summary>Find the right-hand bone by name (Mixamo: "mixamorig:RightHand") — avoids the
        /// HumanoidBodyBones enum (not in this assembly set) and works on any similarly-named rig.</summary>
        public static Transform FindRightHand(Animator animator)
        {
            if (animator == null) return null;
            Transform best = null;
            foreach (var t in animator.GetComponentsInChildren<Transform>())
            {
                string n = t.name.ToLowerInvariant();
                if (n.EndsWith("righthand")) return t; // exact hand (not fingers)
                if (best == null && n.Contains("righthand") &&
                    !n.Contains("index") && !n.Contains("thumb") && !n.Contains("middle") &&
                    !n.Contains("ring") && !n.Contains("pinky") && !n.Contains("finger"))
                    best = t;
            }
            return best;
        }

        /// <summary>Instantiate the model for <paramref name="weaponId"/> parented to <paramref name="hand"/>
        /// (fitted + oriented), returning the barrel-tip muzzle. Null for fists/unknown.</summary>
        public GameObject Attach(Transform hand, string weaponId, out Transform muzzle)
        {
            muzzle = null;
            if (hand == null || !_map.TryGetValue(weaponId, out var e) || e.prefab == null) return null;

            var go = Instantiate(e.prefab, hand);
            go.name = "Weapon_" + weaponId;
            go.transform.localScale = Vector3.one;
            if (material != null)
                foreach (var mr in go.GetComponentsInChildren<MeshRenderer>(true)) mr.sharedMaterial = material;

            // Fit longest dimension to the target length.
            Bounds b = Bounds(go);
            float len = Mathf.Max(b.size.x, b.size.y, b.size.z, 0.001f);
            float s = e.length / len;
            go.transform.localScale = Vector3.one * s;

            // Approximate grip pose in the Mixamo right hand (barrel forward, sits in the palm).
            go.transform.localPosition = new Vector3(0f, 0f, 0.05f);
            go.transform.localRotation = Quaternion.Euler(0f, 90f, 90f);

            // Muzzle at the front of the fitted model (local +Z after the rotation ≈ barrel).
            b = Bounds(go);
            var m = new GameObject("Muzzle").transform;
            m.SetParent(go.transform, false);
            m.position = b.center + go.transform.forward * (b.size.z * 0.5f + 0.02f);
            muzzle = m;
            return go;
        }

        static Bounds Bounds(GameObject go)
        {
            var rs = go.GetComponentsInChildren<Renderer>();
            if (rs.Length == 0) return new Bounds(go.transform.position, new Vector3(0.1f, 0.1f, 0.3f));
            Bounds b = rs[0].bounds;
            for (int i = 1; i < rs.Length; i++) b.Encapsulate(rs[i].bounds);
            return b;
        }
    }
}
