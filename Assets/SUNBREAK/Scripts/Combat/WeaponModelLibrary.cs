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
            public Vector3 pos;       // local offset in the right hand
            public Vector3 euler;     // local rotation in the right hand
        }

        readonly Dictionary<string, Entry> _map = new();

        // The barrel is model-local +Z. We aim it along the character's forward at attach time
        // (see Attach), so these are only a small extra tilt + a hand-local position nudge.
        // pos = offset inside the right hand; euler = tilt about the aimed-forward frame.
        static readonly Vector3 PistolPos = new Vector3(0.01f, -0.02f, 0.03f);
        static readonly Vector3 PistolEuler = new Vector3(6f, 0f, 0f);   // barrel a touch down
        static readonly Vector3 RiflePos = new Vector3(0.02f, -0.03f, 0.06f);
        static readonly Vector3 RifleEuler = new Vector3(4f, 0f, 0f);

        void Awake()
        {
            Instance = this;
            Add("pistol_9mm", pistol, 0.26f, 1, PistolPos, PistolEuler);
            Add("smg_vector", smg, 0.5f, 2, RiflePos, RifleEuler);
            Add("shotgun_pump", shotgun, 0.7f, 2, RiflePos, RifleEuler);
            Add("rifle_carbine", rifle, 0.75f, 2, RiflePos, RifleEuler);
            Add("sniper_bolt", sniper, 0.9f, 2, RiflePos, RifleEuler);
            Add("launcher_rpg", rpg, 1.0f, 2, RiflePos, RifleEuler);
            Add("grenade", grenade, 0.12f, 0, PistolPos, PistolEuler);
        }
        void OnDestroy() { if (Instance == this) Instance = null; }

        void Add(string id, GameObject prefab, float length, int weaponType, Vector3 pos, Vector3 euler)
        {
            if (prefab != null) _map[id] = new Entry { prefab = prefab, length = length, weaponType = weaponType, pos = pos, euler = euler };
        }

        // Procedural melee weapons (no kit prefab) — built in-hand on Attach.
        static readonly HashSet<string> Melee = new() { "bat", "knife" };

        public int WeaponTypeFor(string id) => _map.TryGetValue(id, out var e) ? e.weaponType : 0;
        public bool Has(string id) => _map.ContainsKey(id) || Melee.Contains(id);

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
            if (hand == null) return null;
            if (Melee.Contains(weaponId)) return AttachMelee(hand, weaponId);
            if (!_map.TryGetValue(weaponId, out var e) || e.prefab == null) return null;

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

            // Aim the barrel (model +Z) along the character's forward, expressed in the hand bone's
            // frame — so it points where the player faces regardless of the animated hand rotation
            // (fixes the "gun sideways in hand" look). e.euler adds a small per-weapon tilt.
            Transform charT = hand.GetComponentInParent<Animator>()?.transform;
            Vector3 fwd = charT != null ? charT.forward : hand.forward;
            Vector3 up = charT != null ? charT.up : Vector3.up;
            Quaternion inv = Quaternion.Inverse(hand.rotation);
            Quaternion look = Quaternion.LookRotation((inv * fwd).normalized, (inv * up).normalized);
            go.transform.localPosition = e.pos;
            go.transform.localRotation = look * Quaternion.Euler(e.euler);

            // Muzzle at the front of the fitted model along its local barrel axis.
            b = Bounds(go);
            var m = new GameObject("Muzzle").transform;
            m.SetParent(go.transform, false);
            m.position = b.center + go.transform.forward * (b.size.z * 0.5f + 0.02f);
            muzzle = m;
            return go;
        }

        /// <summary>Build a procedural melee weapon (bat / knife) in the hand.</summary>
        static GameObject AttachMelee(Transform hand, string id)
        {
            var root = new GameObject("Weapon_" + id);
            root.transform.SetParent(hand, false);
            root.transform.localPosition = new Vector3(0.02f, -0.02f, 0.05f);
            root.transform.localRotation = Quaternion.Euler(72f, 0f, 0f);
            if (id == "knife")
            {
                Prim(root.transform, PrimitiveType.Cube, new Vector3(0f, 0f, 0.15f), new Vector3(0.02f, 0.02f, 0.22f), new Color(0.78f, 0.8f, 0.84f));
                Prim(root.transform, PrimitiveType.Cube, Vector3.zero, new Vector3(0.03f, 0.03f, 0.08f), new Color(0.14f, 0.12f, 0.11f));
            }
            else // bat
            {
                var bat = Prim(root.transform, PrimitiveType.Cylinder, new Vector3(0f, 0f, 0.18f), new Vector3(0.05f, 0.32f, 0.05f), new Color(0.5f, 0.34f, 0.18f));
                bat.localRotation = Quaternion.Euler(90f, 0f, 0f);
            }
            return root;
        }

        static Transform Prim(Transform parent, PrimitiveType type, Vector3 pos, Vector3 scale, Color c)
        {
            var go = GameObject.CreatePrimitive(type);
            var col = go.GetComponent<Collider>(); if (col) Destroy(col);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos; go.transform.localScale = scale;
            go.GetComponent<MeshRenderer>().sharedMaterial = new Material(Shader.Find("Universal Render Pipeline/Lit")) { color = c };
            return go.transform;
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
