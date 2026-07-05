using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>
    /// A police roadblock (3★+): two cop cars angled across a road + traffic cones, dropped ahead of
    /// the player's travel direction on the road grid. Reuses <see cref="CityGenerator.BuildCarVisual"/>
    /// for the cars (made solid + kinematic so they block). Despawns as the player leaves or heat drops.
    /// </summary>
    public sealed class Roadblock : MonoBehaviour
    {
        float _spawnT;
        static Material _coneMat;

        public static Roadblock Spawn(CityGenerator city, Vector3 at, Vector3 travelDir)
        {
            float gy = CityGenerator.GroundY(at.x, at.z);
            var root = new GameObject("Roadblock").transform;
            root.position = new Vector3(at.x, gy, at.z);

            Vector3 across = Vector3.Cross(Vector3.up, travelDir); across.y = 0f;
            if (across.sqrMagnitude < 0.01f) across = Vector3.right;
            across.Normalize();
            float yaw = Quaternion.LookRotation(across).eulerAngles.y;

            // Two cruisers angled nose-to-nose across the lane.
            for (int i = -1; i <= 1; i += 2)
            {
                Vector3 cp = root.position + across * (i * 3.4f);
                var carGo = city.BuildCarVisual(new Vector3(cp.x, 0f, cp.z), yaw + i * 18f, new Color(0.15f, 0.2f, 0.32f), out _, out _);
                if (carGo == null) continue;
                carGo.name = "BlockCar";
                carGo.transform.SetParent(root, true);
                var rb = carGo.AddComponent<Rigidbody>(); rb.isKinematic = true; rb.useGravity = false;
                var box = carGo.AddComponent<BoxCollider>(); box.center = new Vector3(0f, 0.7f, 0f); box.size = new Vector3(1.8f, 1.3f, 4.2f);
            }

            // Cones spanning the gap.
            for (int c = -2; c <= 2; c++)
            {
                Vector3 cpos = root.position + across * (c * 1.25f);
                Cone(root, new Vector3(cpos.x, gy, cpos.z));
            }

            var r = root.gameObject.AddComponent<Roadblock>();
            r._spawnT = Time.time;
            Blip.Attach(root.gameObject, BlipKind.Activity, new Color(1f, 0.3f, 0.3f), "Roadblock");
            Debug.Log("SUNBREAK_ROADBLOCK: roadblock deployed");
            return r;
        }

        static void Cone(Transform parent, Vector3 worldPos)
        {
            var cone = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            cone.name = "cone";
            var col = cone.GetComponent<Collider>(); if (col) Destroy(col);
            cone.transform.SetParent(parent, true);
            cone.transform.position = new Vector3(worldPos.x, worldPos.y + 0.35f, worldPos.z);
            cone.transform.localScale = new Vector3(0.28f, 0.35f, 0.28f);
            cone.GetComponent<MeshRenderer>().sharedMaterial = ConeMat();
            CityGenerator.SetLayerRecursive(cone, CityGenerator.CarLayer);
        }

        static Material ConeMat()
        {
            if (_coneMat == null) _coneMat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = new Color(1f, 0.45f, 0.1f) };
            return _coneMat;
        }

        void Update()
        {
            var ws = WantedSystem.Instance;
            Transform player = ws != null ? ws.player : null;
            if (ws == null || player == null || ws.Stars < 3) { Destroy(gameObject); return; }
            if (Time.time - _spawnT > 10f && (transform.position - player.position).sqrMagnitude > 240f * 240f)
                Destroy(gameObject);
        }
    }
}
