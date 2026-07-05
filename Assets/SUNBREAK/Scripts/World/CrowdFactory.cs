using UnityEngine;
using UnityEngine.AI;
using SUNBREAK.Combat;

namespace SUNBREAK.World
{
    /// <summary>
    /// Builds humanoid NPCs (peds + cops) from the shared Mixamo rig: a NavMeshAgent + hittable
    /// capsule + Health + Animator (locomotion blend tree) + tint. Peds are pooled by PedManager;
    /// cops are spawned by WantedSystem. Uses the same character/controller the player uses so the
    /// locomotion blend tree drives them for free.
    /// </summary>
    public sealed class CrowdFactory : MonoBehaviour
    {
        public static CrowdFactory Instance { get; private set; }

        [Header("Wiring (set by IslandSceneBuilder)")]
        public GameObject characterModel;   // fallback / player rig
        public Avatar avatar;
        public RuntimeAnimatorController controller;
        public GameObject[] roster;         // varied civilian/NPC character models
        public Avatar[] rosterAvatars;      // parallel to roster
        public Material[] rosterMaterials;  // parallel to roster (real diffuse+normal materials)
        public GameObject policeModel;      // SWAT / police model
        public Avatar policeAvatar;
        public Material policeMaterial;
        public float targetHeight = 1.8f;

        int _nextNetId = 100000;
        void Awake() { Instance = this; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        void PickModel(Faction faction, out GameObject model, out Avatar av, out Material mat)
        {
            if (faction == Faction.Police && policeModel != null) { model = policeModel; av = policeAvatar; mat = policeMaterial; return; }
            if (roster != null && roster.Length > 0)
            {
                int i = Random.Range(0, roster.Length);
                model = roster[i];
                av = rosterAvatars != null && i < rosterAvatars.Length && rosterAvatars[i] != null ? rosterAvatars[i] : avatar;
                mat = rosterMaterials != null && i < rosterMaterials.Length ? rosterMaterials[i] : null;
                return;
            }
            model = characterModel; av = avatar; mat = null;
        }

        /// <summary>Force the real diffuse+normal material onto every skinned renderer (bulletproof
        /// against embedded/remap misses that render green/white in a build).</summary>
        public static void ApplyMaterial(GameObject vis, Material mat)
        {
            if (mat == null || vis == null) return;
            foreach (var r in vis.GetComponentsInChildren<Renderer>(true))
            {
                if (r is ParticleSystemRenderer) continue;
                int n = Mathf.Max(1, r.sharedMaterials.Length);
                var arr = new Material[n];
                for (int i = 0; i < n; i++) arr[i] = mat;
                r.sharedMaterials = arr;
            }
        }

        /// <summary>Build a humanoid shell (visual + agent + collider + health + anim driver); no AI.</summary>
        public GameObject BuildHumanoid(string name, Faction faction, float health, Color tint,
            out NavMeshAgent agent, out Health hp, out Animator animator)
        {
            var root = new GameObject(name);
            agent = root.AddComponent<NavMeshAgent>();
            agent.radius = 0.3f; agent.height = 1.8f; agent.baseOffset = 0f;
            agent.speed = 1.4f; agent.angularSpeed = 220f; agent.acceleration = 10f; // smoother turns, less spin
            agent.autoBraking = true; agent.stoppingDistance = 0.5f; agent.updateRotation = true;
            agent.obstacleAvoidanceType = ObstacleAvoidanceType.MedQualityObstacleAvoidance;
            agent.avoidancePriority = Random.Range(30, 70); // vary so they don't fight for the same lane

            var col = root.AddComponent<CapsuleCollider>();
            col.radius = 0.35f; col.height = 1.8f; col.center = new Vector3(0f, 0.9f, 0f);

            animator = null;
            PickModel(faction, out var model, out var av, out var mat);
            if (model != null)
            {
                var vis = Instantiate(model, root.transform);
                vis.name = "Visual";
                vis.transform.localPosition = Vector3.zero;
                vis.transform.localScale = Vector3.one;
                Bounds b = Bounds0(vis);
                float h = Mathf.Max(0.01f, b.size.y);
                vis.transform.localScale = Vector3.one * (targetHeight / h);
                b = Bounds0(vis);
                vis.transform.localPosition = new Vector3(0f, -b.min.y, 0f); // feet at root origin
                animator = vis.GetComponent<Animator>() ?? vis.AddComponent<Animator>();
                if (av != null) animator.avatar = av;
                animator.runtimeAnimatorController = controller;
                animator.applyRootMotion = false;
                animator.cullingMode = AnimatorCullingMode.CullUpdateTransforms;
                ApplyMaterial(vis, mat); // guarantee the textured material renders in the build
                // Police keep their authored (SWAT) look; civilians get a subtle wardrobe tint.
                if (faction != Faction.Police) Tint(vis, tint);
            }

            hp = root.AddComponent<Health>();
            hp.Init(health, faction, _nextNetId++);

            var driver = root.AddComponent<CharacterAnimDriver>();
            driver.agent = agent; driver.animator = animator;
            return root;
        }

        /// <summary>Attach a visible weapon to an NPC's right hand + set its armed hold pose. Returns
        /// the spawned model so pooled NPCs can remove it on recycle.</summary>
        public static GameObject EquipWeapon(Animator animator, string weaponId)
        {
            if (animator == null || string.IsNullOrEmpty(weaponId)) return null;
            var lib = SUNBREAK.Combat.WeaponModelLibrary.Instance;
            if (lib == null) return null;
            var hand = SUNBREAK.Combat.WeaponModelLibrary.FindRightHand(animator);
            if (hand == null) return null;
            var go = lib.Attach(hand, weaponId, out _);
            int wt = lib.WeaponTypeFor(weaponId);
            animator.SetInteger("WeaponType", wt);
            animator.SetBool("Armed", wt != 0);
            return go;
        }

        public static void SetUnarmed(Animator animator)
        {
            if (animator == null) return;
            animator.SetInteger("WeaponType", 0);
            animator.SetBool("Armed", false);
        }

        public Cop SpawnCop(Vector3 pos, string weapon, float accuracy, float health, int star, bool swat = false)
        {
            var go = BuildHumanoid("Cop", Faction.Police, health, new Color(0.35f, 0.42f, 0.62f),
                out var agent, out var hp, out var animator);
            if (!Place(go, agent, pos)) { Destroy(go); return null; }
            // 4–5★ SWAT: the Ch15 model gets a dark tactical tint + a touch more presence.
            if (swat) { Tint(go, new Color(0.27f, 0.29f, 0.35f)); go.transform.localScale = Vector3.one * 1.05f; }
            EquipWeapon(animator, weapon);
            var cop = go.AddComponent<Cop>();
            cop.Init(agent, hp, weapon, accuracy, star);
            return cop;
        }

        /// <summary>Warp the built humanoid onto the NavMesh near <paramref name="pos"/>.</summary>
        public static bool Place(GameObject go, NavMeshAgent agent, Vector3 pos)
        {
            if (NavMesh.SamplePosition(pos, out var hit, 12f, NavMesh.AllAreas))
            {
                go.transform.position = hit.position;
                if (agent.isActiveAndEnabled) agent.Warp(hit.position);
                return true;
            }
            go.transform.position = pos;
            return false;
        }

        static Bounds Bounds0(GameObject go)
        {
            var rs = go.GetComponentsInChildren<Renderer>();
            if (rs.Length == 0) return new Bounds(go.transform.position, new Vector3(0.5f, 1.8f, 0.5f));
            Bounds b = rs[0].bounds;
            for (int i = 1; i < rs.Length; i++) b.Encapsulate(rs[i].bounds);
            return b;
        }

        static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");
        static void Tint(GameObject go, Color tint)
        {
            var mpb = new MaterialPropertyBlock();
            foreach (var r in go.GetComponentsInChildren<Renderer>())
            {
                r.GetPropertyBlock(mpb);
                mpb.SetColor(BaseColorId, tint);
                r.SetPropertyBlock(mpb);
            }
        }

        public static Color RandomCivilianTint()
        {
            // The tint MULTIPLIES the whole diffuse (skin + clothes) via _BaseColor, so a saturated
            // hue turns the entire NPC that colour (the old palette's green/0.33 made "green NPCs").
            // Keep it near-white / low-saturation: subtle wardrobe variation, texture stays readable.
            float[] hues = { 0.58f, 0.08f, 0.10f, 0.62f, 0.03f, 0.72f }; // blues / warms / faint violet
            Color c = Color.HSVToRGB(hues[Random.Range(0, hues.Length)],
                                     Random.Range(0.05f, 0.17f),   // low saturation
                                     Random.Range(0.85f, 1.0f));   // stay bright, don't darken skin
            return c;
        }
    }
}
