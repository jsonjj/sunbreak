using UnityEngine;
using SUNBREAK.Combat;

namespace SUNBREAK.World
{
    /// <summary>
    /// Police helicopter (3★+). A kinematic AI pilot that orbits above the player, shines a
    /// spotlight down, relays the player's position to ground units (updates the wanted LKP), and
    /// lets its gunner fire down at the player. Killable via <see cref="CarHealth"/> (shoot it down).
    /// Despawns when heat drops below 3★. Reuses the same procedural heli look as the player chopper
    /// (kept kinematic here for stable AI flight rather than the player's physics controller).
    /// </summary>
    public sealed class CopHeli : MonoBehaviour
    {
        const float Altitude = 40f, OrbitRadius = 26f, MoveSpeed = 26f, FireInterval = 1.7f;

        Transform _mainRotor, _tailRotor, _spotPivot;
        CarHealth _health;
        float _fireT, _orbit;

        public static CopHeli Spawn(Vector3 near)
        {
            var go = new GameObject("CopHeli");
            BuildModel(go.transform, out var main, out var tail, out var spot);
            go.transform.position = near + Vector3.up * Altitude;

            var rb = go.AddComponent<Rigidbody>();
            rb.isKinematic = true; rb.useGravity = false;
            var box = go.AddComponent<BoxCollider>();
            box.center = new Vector3(0f, 0f, -0.2f); box.size = new Vector3(1.8f, 1.6f, 3.6f);
            go.AddComponent<CarHealth>();
            CityGenerator.SetLayerRecursive(go, CityGenerator.CarLayer);
            Blip.Attach(go, BlipKind.Activity, new Color(0.4f, 0.6f, 1f), "Police Heli");

            Debug.Log("SUNBREAK_COPHELI: police helicopter dispatched");
            var h = go.AddComponent<CopHeli>();
            h._mainRotor = main; h._tailRotor = tail; h._spotPivot = spot;
            h._health = go.GetComponent<CarHealth>();
            h._orbit = Random.value * Mathf.PI * 2f;
            h._fireT = 1.5f;
            return h;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            // Rotor blur regardless of state.
            if (_mainRotor != null) _mainRotor.Rotate(0f, 1500f * dt, 0f, Space.Self);
            if (_tailRotor != null) _tailRotor.Rotate(1500f * dt, 0f, 0f, Space.Self);

            // Shot down → spin out of the sky + despawn.
            if (_health != null && _health.IsDead)
            {
                transform.position += Vector3.down * 22f * dt;
                transform.Rotate(0f, 260f * dt, 55f * dt, Space.Self);
                Destroy(gameObject, 2.5f);
                enabled = false;
                return;
            }

            var ws = WantedSystem.Instance;
            Transform player = ws != null ? ws.player : null;
            if (ws == null || player == null || ws.Stars < 3) { Destroy(gameObject); return; }

            // Orbit above the player.
            _orbit += (MoveSpeed / OrbitRadius) * dt;
            Vector3 target = player.position + new Vector3(Mathf.Cos(_orbit) * OrbitRadius, Altitude, Mathf.Sin(_orbit) * OrbitRadius);
            transform.position = Vector3.MoveTowards(transform.position, target, MoveSpeed * 1.6f * dt);

            // Nose toward travel; bank slightly.
            Vector3 flat = target - transform.position; flat.y = 0f;
            if (flat.sqrMagnitude > 0.5f)
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(flat, Vector3.up), 1f - Mathf.Exp(-3f * dt));

            // Spotlight tracks the player.
            if (_spotPivot != null)
            {
                Vector3 look = player.position - _spotPivot.position;
                if (look.sqrMagnitude > 0.1f) _spotPivot.rotation = Quaternion.LookRotation(look);
            }

            // Relay the player's position to ground units (keeps the LKP fresh).
            ws.RelayPosition(player.position);

            // Gunner fires down at the player.
            _fireT -= dt;
            if (_fireT <= 0f)
            {
                bool fired = NpcGun.FireAt(gameObject, player, ws.playerState, "smg_vector", 0.3f);
                _fireT = fired ? FireInterval : 0.5f;
            }
        }

        static void BuildModel(Transform root, out Transform mainRotor, out Transform tailRotor, out Transform spotPivot)
        {
            var body = Mat(new Color(0.16f, 0.19f, 0.26f));
            var dark = Mat(new Color(0.1f, 0.1f, 0.12f));
            var glass = Mat(new Color(0.3f, 0.45f, 0.6f));

            Box(root, "body", new Vector3(0f, 0f, 0.1f), new Vector3(1.5f, 1.3f, 2.8f), body);
            Sphere(root, "canopy", new Vector3(0f, 0.15f, 1.5f), new Vector3(1.45f, 1.25f, 1.5f), glass);
            Box(root, "tailBoom", new Vector3(0f, 0.35f, -2.4f), new Vector3(0.32f, 0.32f, 2.6f), body);
            Box(root, "tailFin", new Vector3(0f, 0.75f, -3.5f), new Vector3(0.14f, 0.9f, 0.6f), body);
            Box(root, "skidL", new Vector3(-0.75f, -0.95f, 0f), new Vector3(0.12f, 0.12f, 2.6f), dark);
            Box(root, "skidR", new Vector3(0.75f, -0.95f, 0f), new Vector3(0.12f, 0.12f, 2.6f), dark);
            Box(root, "mast", new Vector3(0f, 0.9f, 0.1f), new Vector3(0.18f, 0.5f, 0.18f), dark);

            var mr = new GameObject("MainRotor").transform; mr.SetParent(root, false); mr.localPosition = new Vector3(0f, 1.2f, 0.1f);
            Box(mr, "blade1", Vector3.zero, new Vector3(0.28f, 0.05f, 8.4f), dark);
            Box(mr, "blade2", Vector3.zero, new Vector3(8.4f, 0.05f, 0.28f), dark);
            mainRotor = mr;

            var tr = new GameObject("TailRotor").transform; tr.SetParent(root, false); tr.localPosition = new Vector3(0.18f, 0.75f, -3.6f);
            Box(tr, "tblade", Vector3.zero, new Vector3(1.5f, 0.05f, 0.16f), dark);
            tailRotor = tr;

            // Downward spotlight.
            var sp = new GameObject("Spot").transform; sp.SetParent(root, false); sp.localPosition = new Vector3(0f, -0.6f, 0.6f);
            var light = sp.gameObject.AddComponent<Light>();
            light.type = LightType.Spot; light.range = 120f; light.spotAngle = 34f; light.intensity = 6f;
            light.color = new Color(0.95f, 0.97f, 1f); light.shadows = LightShadows.None;
            sp.localRotation = Quaternion.Euler(90f, 0f, 0f);
            spotPivot = sp;
        }

        static Transform Box(Transform p, string n, Vector3 pos, Vector3 s, Material m)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube); go.name = n; Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(p, false); go.transform.localPosition = pos; go.transform.localScale = s;
            go.GetComponent<MeshRenderer>().sharedMaterial = m; return go.transform;
        }
        static Transform Sphere(Transform p, string n, Vector3 pos, Vector3 s, Material m)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere); go.name = n; Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(p, false); go.transform.localPosition = pos; go.transform.localScale = s;
            go.GetComponent<MeshRenderer>().sharedMaterial = m; return go.transform;
        }
        static Material Mat(Color c) => new Material(Shader.Find("Universal Render Pipeline/Lit")) { color = c };
    }
}
