using UnityEngine;
using SUNBREAK.Player;
using SUNBREAK.UI;

namespace SUNBREAK.World
{
    /// <summary>
    /// Flagship enterable building. A street door (press E) teleports the player into a small
    /// procedural interior with a counter that opens the gun-store economy, and an exit door back to
    /// the street. Template for future enterable buildings. Interior sits off-map so it never
    /// overlaps the city; the player is teleported in/out.
    /// </summary>
    public sealed class EnterableShop : Interactable
    {
        public ShopKind kind = ShopKind.GunStore;
        public string label = "Ironsights Armory";

        Vector3 _interiorSpawn, _exteriorReturn;
        float _interiorYaw, _exteriorYaw;
        bool _built;

        public override string Prompt => $"Press E — Enter {label}";

        void Start()
        {
            if (Physics.Raycast(transform.position + Vector3.up * 300f, Vector3.down, out var hit, 600f, ~0, QueryTriggerInteraction.Ignore))
                transform.position = new Vector3(transform.position.x, hit.point.y, transform.position.z);

            _exteriorReturn = transform.position + Vector3.up * 0.2f;
            _exteriorYaw = transform.eulerAngles.y;

            var c = new Color(1f, 0.4f, 0.3f);
            BuildBeacon(c, "ENTER");
            Blip.Attach(gameObject, BlipKind.Shop, c, label);
        }

        public override void Interact(GameObject player)
        {
            EnsureInterior();
            Teleport(_interiorSpawn, _interiorYaw);
        }

        public void ExitToStreet()
        {
            Teleport(_exteriorReturn, _exteriorYaw);
        }

        static void Teleport(Vector3 pos, float yaw)
        {
            var pc = GameRefs.Player != null ? GameRefs.Player.GetComponent<PlayerController>() : null;
            if (pc != null) pc.Teleport(pos, yaw);
            else if (GameRefs.Player != null) GameRefs.Player.position = pos;
        }

        // ── Interior ────────────────────────────────────────────────────────────
        void EnsureInterior()
        {
            if (_built) return;
            _built = true;

            // Off-map origin (well within the finite-position clamp), away from the city.
            Vector3 o = new Vector3(1600f, 200f, 1600f);
            var room = new GameObject("ShopInterior_" + label);
            room.transform.position = o;

            var floorMat = Mat(new Color(0.22f, 0.2f, 0.22f));
            var wallMat = Mat(new Color(0.3f, 0.28f, 0.3f));
            var counterMat = Mat(new Color(0.45f, 0.3f, 0.22f));

            float w = 12f, d = 9f, h = 4f;
            Box(room.transform, "Floor", new Vector3(0, -0.25f, 0), new Vector3(w, 0.5f, d), floorMat);
            Box(room.transform, "Ceiling", new Vector3(0, h, 0), new Vector3(w, 0.3f, d), floorMat);
            Box(room.transform, "WallBack", new Vector3(0, h * 0.5f, d * 0.5f), new Vector3(w, h, 0.3f), wallMat);
            Box(room.transform, "WallLeft", new Vector3(-w * 0.5f, h * 0.5f, 0), new Vector3(0.3f, h, d), wallMat);
            Box(room.transform, "WallRight", new Vector3(w * 0.5f, h * 0.5f, 0), new Vector3(0.3f, h, d), wallMat);
            // Front wall with a doorway gap (two segments).
            Box(room.transform, "WallFrontL", new Vector3(-w * 0.3f, h * 0.5f, -d * 0.5f), new Vector3(w * 0.4f, h, 0.3f), wallMat);
            Box(room.transform, "WallFrontR", new Vector3(w * 0.3f, h * 0.5f, -d * 0.5f), new Vector3(w * 0.4f, h, 0.3f), wallMat);

            // Counter along the back.
            Box(room.transform, "Counter", new Vector3(0, 0.55f, d * 0.28f), new Vector3(w * 0.7f, 1.1f, 0.8f), counterMat);

            // Interior light (ceiling is closed, so light it).
            var lightGo = new GameObject("Light");
            lightGo.transform.SetParent(room.transform, false);
            lightGo.transform.localPosition = new Vector3(0, h - 0.6f, 0);
            var l = lightGo.AddComponent<Light>();
            l.type = LightType.Point; l.range = 18f; l.intensity = 2.2f; l.color = new Color(1f, 0.95f, 0.85f);

            // Buy counter (opens the existing gun-store economy).
            var counter = new GameObject("Counter Interact");
            counter.transform.position = o + new Vector3(0, 0, d * 0.28f - 1.2f);
            var shop = counter.AddComponent<Shop>();
            shop.kind = kind; shop.range = 3.2f;

            // Exit door near the entrance.
            var exit = new GameObject("Exit Door");
            exit.transform.position = o + new Vector3(0, 0, -d * 0.5f + 1.2f);
            var door = exit.AddComponent<ShopExitDoor>();
            door.shop = this; door.range = 3.2f;

            _interiorSpawn = o + new Vector3(0, 0.2f, -d * 0.5f + 2.5f);
            _interiorYaw = 0f; // face the counter (+Z)
        }

        void BuildBeacon(Color c, string _)
        {
            var beacon = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            beacon.name = "beacon";
            Destroy(beacon.GetComponent<Collider>());
            beacon.transform.SetParent(transform, false);
            beacon.transform.localScale = new Vector3(0.5f, 6f, 0.5f);
            beacon.transform.localPosition = new Vector3(0f, 6f, 0f);
            var mat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = c };
            var r = beacon.GetComponent<MeshRenderer>();
            r.sharedMaterial = mat; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        static Material Mat(Color c)
        {
            var m = new Material(Shader.Find("Universal Render Pipeline/Lit")) { color = c };
            return m;
        }

        static void Box(Transform parent, string name, Vector3 localPos, Vector3 size, Material mat)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = size;
            go.GetComponent<MeshRenderer>().sharedMaterial = mat;
        }
    }
}
