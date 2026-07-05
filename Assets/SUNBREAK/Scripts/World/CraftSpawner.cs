using UnityEngine;
using SUNBREAK.Vehicles;

namespace SUNBREAK.World
{
    public enum CraftKind { Boat, Helicopter, Plane }

    /// <summary>
    /// Runtime spawner for the non-car vehicles (like <c>ShowcaseCarSpawner</c> for cars). Builds a
    /// cohesive procedural stylized model (hull / heli body + rotors / plane fuselage + wings), wires
    /// a Rigidbody + collider + <see cref="CarHealth"/> + the matching controller, snaps it to the
    /// water/ground, and adds a minimap blip. CC0 kit meshes can later drop in via the same attach
    /// pattern the cars use. Placed by IslandSceneBuilder at the marina / airfield.
    /// </summary>
    public sealed class CraftSpawner : MonoBehaviour
    {
        public CraftKind kind = CraftKind.Boat;
        public float yaw;

        static Material _hull, _cabin, _heli, _plane, _dark, _glass, _rotor;

        System.Collections.IEnumerator Start()
        {
            yield return null; // let CityGenerator build the terrain collider first
            yield return null;
            EnsureMats();
            switch (kind)
            {
                case CraftKind.Boat: BuildBoat(); break;
                case CraftKind.Helicopter: BuildHelicopter(); break;
                case CraftKind.Plane: BuildPlane(); break;
            }
        }

        // ── Boat ──────────────────────────────────────────────────────────────
        void BuildBoat()
        {
            var root = new GameObject("Boat").transform;
            Box(root, "hull", new Vector3(0f, 0f, -0.2f), new Vector3(2.4f, 0.9f, 4.6f), _hull);
            var bow = Box(root, "bow", new Vector3(0f, 0f, 2.55f), new Vector3(1.7f, 0.9f, 1.7f), _hull);
            bow.localRotation = Quaternion.Euler(0f, 45f, 0f); // diamond → reads as a pointed prow
            Box(root, "deck", new Vector3(0f, 0.5f, -0.4f), new Vector3(2.2f, 0.15f, 3.8f), _cabin);
            Box(root, "cabin", new Vector3(0f, 1.0f, -1.4f), new Vector3(1.7f, 1.0f, 1.7f), _cabin);
            var ws = Box(root, "windshield", new Vector3(0f, 1.05f, -0.4f), new Vector3(1.5f, 0.8f, 0.12f), _glass);
            ws.localRotation = Quaternion.Euler(24f, 0f, 0f);
            Box(root, "mast", new Vector3(0f, 1.7f, -1.4f), new Vector3(0.1f, 1.4f, 0.1f), _dark);

            float y = Geography.WATER_LEVEL + 0.35f; // drop onto the water; buoyancy settles it
            root.SetPositionAndRotation(new Vector3(transform.position.x, y, transform.position.z), Quaternion.Euler(0f, yaw, 0f));

            var rb = root.gameObject.AddComponent<Rigidbody>();
            var box = root.gameObject.AddComponent<BoxCollider>();
            box.center = new Vector3(0f, 0.2f, 0f); box.size = new Vector3(2.4f, 1.2f, 5.4f);
            root.gameObject.AddComponent<CarHealth>();
            root.gameObject.AddComponent<BoatController>();
            Finish(root.gameObject, new Color(0.95f, 0.55f, 0.35f), "Boat");
            Destroy(gameObject);
        }

        // ── Helicopter ────────────────────────────────────────────────────────
        void BuildHelicopter()
        {
            var root = new GameObject("Helicopter").transform;
            Box(root, "body", new Vector3(0f, 0f, 0.1f), new Vector3(1.5f, 1.3f, 2.8f), _heli);
            var nose = Sphere(root, "canopy", new Vector3(0f, 0.15f, 1.5f), new Vector3(1.45f, 1.25f, 1.5f), _glass);
            Box(root, "tailBoom", new Vector3(0f, 0.35f, -2.4f), new Vector3(0.32f, 0.32f, 2.6f), _heli);
            Box(root, "tailFin", new Vector3(0f, 0.75f, -3.5f), new Vector3(0.14f, 0.9f, 0.6f), _heli);
            Box(root, "skidL", new Vector3(-0.75f, -0.95f, 0f), new Vector3(0.12f, 0.12f, 2.6f), _dark);
            Box(root, "skidR", new Vector3(0.75f, -0.95f, 0f), new Vector3(0.12f, 0.12f, 2.6f), _dark);
            Box(root, "strutL", new Vector3(-0.55f, -0.5f, 0.4f), new Vector3(0.1f, 0.8f, 0.1f), _dark);
            Box(root, "strutR", new Vector3(0.55f, -0.5f, 0.4f), new Vector3(0.1f, 0.8f, 0.1f), _dark);
            Box(root, "mast", new Vector3(0f, 0.9f, 0.1f), new Vector3(0.18f, 0.5f, 0.18f), _dark);

            var mainRotor = new GameObject("MainRotor").transform;
            mainRotor.SetParent(root, false); mainRotor.localPosition = new Vector3(0f, 1.2f, 0.1f);
            Box(mainRotor, "blade1", Vector3.zero, new Vector3(0.28f, 0.05f, 8.2f), _rotor);
            Box(mainRotor, "blade2", Vector3.zero, new Vector3(8.2f, 0.05f, 0.28f), _rotor);
            Cyl(mainRotor, "hub", Vector3.zero, new Vector3(0.3f, 0.12f, 0.3f), _dark);

            var tailRotor = new GameObject("TailRotor").transform;
            tailRotor.SetParent(root, false); tailRotor.localPosition = new Vector3(0.18f, 0.75f, -3.6f);
            Box(tailRotor, "tblade", Vector3.zero, new Vector3(1.5f, 0.05f, 0.16f), _rotor);

            float gy = CityGenerator.GroundY(transform.position.x, transform.position.z);
            root.SetPositionAndRotation(new Vector3(transform.position.x, gy + 1.05f, transform.position.z), Quaternion.Euler(0f, yaw, 0f));

            var rb = root.gameObject.AddComponent<Rigidbody>();
            var box = root.gameObject.AddComponent<BoxCollider>();
            box.center = new Vector3(0f, 0f, -0.2f); box.size = new Vector3(1.7f, 1.5f, 3.4f);
            root.gameObject.AddComponent<CarHealth>();
            var air = root.gameObject.AddComponent<AircraftController>();
            air.MakeHelicopter(); air.mainRotor = mainRotor; air.tailRotor = tailRotor;
            Finish(root.gameObject, new Color(0.4f, 0.6f, 0.9f), "Helicopter");
            Destroy(gameObject);
        }

        // ── Plane ─────────────────────────────────────────────────────────────
        void BuildPlane()
        {
            var root = new GameObject("Plane").transform;
            Box(root, "fuselage", new Vector3(0f, 0f, 0f), new Vector3(1.0f, 1.0f, 6.0f), _plane);
            Sphere(root, "nose", new Vector3(0f, 0f, 3.0f), new Vector3(1.0f, 1.0f, 1.2f), _plane);
            Box(root, "wings", new Vector3(0f, 0.05f, 0.4f), new Vector3(8.4f, 0.2f, 1.6f), _plane);
            Box(root, "tailH", new Vector3(0f, 0.15f, -2.7f), new Vector3(3.0f, 0.16f, 0.9f), _plane);
            Box(root, "tailV", new Vector3(0f, 0.9f, -2.7f), new Vector3(0.16f, 1.2f, 1.0f), _plane);
            var canopy = Sphere(root, "canopy", new Vector3(0f, 0.55f, 1.1f), new Vector3(0.9f, 0.7f, 1.6f), _glass);
            // Landing gear (so it rests on the runway).
            Cyl(root, "gearNose", new Vector3(0f, -0.85f, 2.0f), new Vector3(0.34f, 0.1f, 0.34f), _dark);
            Cyl(root, "gearL", new Vector3(-1.1f, -0.85f, -0.2f), new Vector3(0.38f, 0.1f, 0.38f), _dark);
            Cyl(root, "gearR", new Vector3(1.1f, -0.85f, -0.2f), new Vector3(0.38f, 0.1f, 0.38f), _dark);

            var prop = new GameObject("Prop").transform;
            prop.SetParent(root, false); prop.localPosition = new Vector3(0f, 0f, 3.5f);
            Box(prop, "pblade1", Vector3.zero, new Vector3(0.2f, 2.8f, 0.06f), _rotor);
            Box(prop, "pblade2", Vector3.zero, new Vector3(2.8f, 0.2f, 0.06f), _rotor);
            Cyl(prop, "phub", Vector3.zero, new Vector3(0.25f, 0.14f, 0.25f), _dark).localRotation = Quaternion.Euler(90f, 0f, 0f);

            float gy = CityGenerator.GroundY(transform.position.x, transform.position.z);
            root.SetPositionAndRotation(new Vector3(transform.position.x, gy + 1.0f, transform.position.z), Quaternion.Euler(0f, yaw, 0f));

            var rb = root.gameObject.AddComponent<Rigidbody>();
            var box = root.gameObject.AddComponent<BoxCollider>();
            box.center = new Vector3(0f, 0f, 0f); box.size = new Vector3(1.2f, 1.2f, 6.2f);
            root.gameObject.AddComponent<CarHealth>();
            var air = root.gameObject.AddComponent<AircraftController>();
            air.MakePlane(); air.mainRotor = prop;
            Finish(root.gameObject, new Color(0.85f, 0.87f, 0.92f), "Plane");
            Destroy(gameObject);
        }

        // ── Shared ──────────────────────────────────────────────────────────────
        void Finish(GameObject go, Color blip, string label)
        {
            CityGenerator.SetLayerRecursive(go, CityGenerator.CarLayer); // ignored by ground/wheel rays
            Blip.Attach(go, BlipKind.Activity, blip, label);
        }

        static Transform Box(Transform parent, string name, Vector3 pos, Vector3 size, Material mat)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name; Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos; go.transform.localScale = size;
            go.GetComponent<MeshRenderer>().sharedMaterial = mat;
            return go.transform;
        }

        static Transform Sphere(Transform parent, string name, Vector3 pos, Vector3 size, Material mat)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            go.name = name; Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos; go.transform.localScale = size;
            go.GetComponent<MeshRenderer>().sharedMaterial = mat;
            return go.transform;
        }

        static Transform Cyl(Transform parent, string name, Vector3 pos, Vector3 size, Material mat)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            go.name = name; Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos; go.transform.localScale = size;
            go.GetComponent<MeshRenderer>().sharedMaterial = mat;
            return go.transform;
        }

        static void EnsureMats()
        {
            if (_hull != null) return;
            _hull = Lit(new Color(0.9f, 0.32f, 0.26f));
            _cabin = Lit(new Color(0.92f, 0.9f, 0.86f));
            _heli = Lit(new Color(0.22f, 0.28f, 0.36f));
            _plane = Lit(new Color(0.84f, 0.86f, 0.9f));
            _dark = Lit(new Color(0.14f, 0.15f, 0.17f));
            _rotor = Lit(new Color(0.1f, 0.1f, 0.12f));
            _glass = Lit(new Color(0.35f, 0.5f, 0.62f));
        }

        static Material Lit(Color c)
        {
            var m = new Material(Shader.Find("Universal Render Pipeline/Lit")) { color = c };
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0.25f);
            return m;
        }
    }
}
