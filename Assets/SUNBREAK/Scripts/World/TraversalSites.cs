using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>
    /// Makes the decorative airfield + marina real: paints a runway + apron + helipad on the Sol
    /// Verano Airfield apron and a wooden dock at the Marina, all snapped to the terrain, and adds
    /// map blips. These are the spawn points for the aircraft + boats (see the shared coords).
    /// Runs once at runtime (after CityGenerator has built the terrain collider).
    /// </summary>
    public sealed class TraversalSites : MonoBehaviour
    {
        // Shared spawn coordinates (used by IslandSceneBuilder's CraftSpawners).
        public static readonly Vector3 RunwaySouth = new Vector3(345f, 0f, 262f); // plane spawn, faces +Z (north)
        public static readonly Vector3 Helipad = new Vector3(400f, 0f, 292f);      // heli spawn
        public static readonly Vector3[] BoatDocks =
        {
            new Vector3(-235f, 0f, 448f), new Vector3(-265f, 0f, 448f), new Vector3(-250f, 0f, 458f),
        };

        static Material _asphalt, _concrete, _white, _yellow, _wood, _post;

        System.Collections.IEnumerator Start()
        {
            // Let CityGenerator build the terrain + collider first so GroundY raycasts land.
            yield return null;
            yield return null;
            EnsureMats();
            BuildRunway();
            BuildApron();
            BuildHelipad();
            BuildDock();
            AddBlips();
        }

        void BuildRunway()
        {
            var c = new Vector3(345f, 0f, 350f);
            float gy = CityGenerator.GroundY(c.x, c.z);
            var root = new GameObject("Runway").transform;
            root.position = new Vector3(c.x, gy + 0.05f, c.z);
            Slab(root, "surface", Vector3.zero, new Vector3(24f, 0.1f, 220f), _asphalt);
            // Dashed centreline.
            for (float z = -95f; z <= 95f; z += 16f)
                Slab(root, "dash", new Vector3(0f, 0.08f, z), new Vector3(1.1f, 0.02f, 7f), _white);
            // Threshold bars at both ends.
            for (int e = -1; e <= 1; e += 2)
                for (float x = -8f; x <= 8f; x += 3.2f)
                    Slab(root, "thresh", new Vector3(x, 0.08f, e * 104f), new Vector3(1.4f, 0.02f, 8f), _white);
        }

        void BuildApron()
        {
            var c = new Vector3(420f, 0f, 300f);
            float gy = CityGenerator.GroundY(c.x, c.z);
            var root = new GameObject("Apron").transform;
            root.position = new Vector3(c.x, gy + 0.04f, c.z);
            Slab(root, "concrete", Vector3.zero, new Vector3(100f, 0.08f, 130f), _concrete);
        }

        void BuildHelipad()
        {
            var c = Helipad;
            float gy = CityGenerator.GroundY(c.x, c.z);
            var root = new GameObject("Helipad").transform;
            root.position = new Vector3(c.x, gy + 0.06f, c.z);
            Slab(root, "pad", Vector3.zero, new Vector3(16f, 0.1f, 16f), _concrete);
            // Yellow ring + "H".
            for (int i = 0; i < 24; i++)
            {
                float a = i / 24f * Mathf.PI * 2f;
                Slab(root, "ring", new Vector3(Mathf.Cos(a) * 6.5f, 0.06f, Mathf.Sin(a) * 6.5f), new Vector3(1.4f, 0.02f, 1.4f), _yellow);
            }
            Slab(root, "Hleft", new Vector3(-2f, 0.07f, 0f), new Vector3(1.1f, 0.02f, 6f), _yellow);
            Slab(root, "Hright", new Vector3(2f, 0.07f, 0f), new Vector3(1.1f, 0.02f, 6f), _yellow);
            Slab(root, "Hbar", new Vector3(0f, 0.07f, 0f), new Vector3(3f, 0.02f, 1.1f), _yellow);
        }

        void BuildDock()
        {
            var c = new Vector3(-250f, 0f, 400f);
            var root = new GameObject("MarinaDock").transform;
            root.position = new Vector3(c.x, 0.3f, c.z); // deck above the waterline (-1.2)
            Slab(root, "deck", Vector3.zero, new Vector3(7f, 0.25f, 48f), _wood);
            Slab(root, "deckCross", new Vector3(0f, 0f, 24f), new Vector3(20f, 0.25f, 6f), _wood); // T head
            // Pilings down into the water.
            for (float z = -22f; z <= 26f; z += 8f)
                for (int s = -1; s <= 1; s += 2)
                    Post(root, new Vector3(s * 3f, -0.9f, z), 2.4f);
            for (int s = -1; s <= 1; s += 2)
                Post(root, new Vector3(s * 9f, -0.9f, 24f), 2.4f);
        }

        void AddBlips()
        {
            Marker("Sol Verano Airport", new Vector3(345f, 1f, 350f), new Color(0.6f, 0.8f, 1f));
            Marker("Helipad", new Vector3(Helipad.x, 1f, Helipad.z), new Color(1f, 0.85f, 0.35f));
            Marker("Marina", new Vector3(-250f, 1f, 415f), new Color(0.35f, 0.85f, 0.85f));
        }

        static void Marker(string label, Vector3 pos, Color c)
        {
            var go = new GameObject("POI_" + label) { transform = { position = pos } };
            Blip.Attach(go, BlipKind.Shop, c, label);
        }

        // ── helpers ──
        static Transform Slab(Transform parent, string name, Vector3 pos, Vector3 size, Material mat)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos; go.transform.localScale = size;
            go.GetComponent<MeshRenderer>().sharedMaterial = mat;
            go.GetComponent<MeshRenderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            // Keep only the big surfaces collidable; paint markers are trigger-free decals.
            if (size.x < 4f && size.z < 9f) Destroy(go.GetComponent<Collider>());
            return go.transform;
        }

        static void Post(Transform parent, Vector3 pos, float height)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            go.name = "piling"; Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos; go.transform.localScale = new Vector3(0.35f, height, 0.35f);
            go.GetComponent<MeshRenderer>().sharedMaterial = _post;
        }

        static void EnsureMats()
        {
            if (_asphalt != null) return;
            _asphalt = Lit(new Color(0.11f, 0.11f, 0.12f));
            _concrete = Lit(new Color(0.52f, 0.52f, 0.54f));
            _white = Unlit(new Color(0.92f, 0.92f, 0.92f));
            _yellow = Unlit(new Color(0.95f, 0.8f, 0.2f));
            _wood = Lit(new Color(0.45f, 0.33f, 0.22f));
            _post = Lit(new Color(0.3f, 0.24f, 0.18f));
        }

        static Material Lit(Color c)
        {
            var m = new Material(Shader.Find("Universal Render Pipeline/Lit")) { color = c };
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0.05f);
            return m;
        }
        static Material Unlit(Color c) => new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = c };
    }
}
