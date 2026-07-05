using UnityEngine;
using UnityEngine.UI;
using SUNBREAK.Player;
using SUNBREAK.UI;

namespace SUNBREAK.World
{
    /// <summary>
    /// Enterable building. A street door (press E) teleports the player into a small procedural
    /// interior themed for its kind — gun store, hospital, convenience store, car dealership showroom,
    /// or safehouse — with a service counter and an exit door back to the street. Interiors sit off-map
    /// so they never overlap the city; the player is teleported in/out. Template for all walk-ins.
    /// </summary>
    public sealed class EnterableShop : Interactable
    {
        public ShopKind kind = ShopKind.GunStore;
        public bool safehouse = false;   // overrides kind: the interior is a save room
        public string label = "Ironsights Armory";

        Vector3 _interiorSpawn, _exteriorReturn;
        float _interiorYaw, _exteriorYaw;
        bool _built;
        Transform _sign;
        static int _interiorSlot; // stagger interiors so they never overlap off-map

        /// <summary>True while the player is teleported inside an interior — WorldBounds must not
        /// "recover" the player from the off-map interior position while this is set.</summary>
        public static bool PlayerInside;

        public override string Prompt => $"Press E \u2014 Enter {label}";

        // ── Theme ────────────────────────────────────────────────────────────────
        Color Accent => safehouse ? new Color(0.45f, 0.9f, 0.6f) : kind switch
        {
            ShopKind.GunStore => new Color(1f, 0.4f, 0.3f),
            ShopKind.Hospital => new Color(1f, 0.34f, 0.4f),
            ShopKind.Convenience => new Color(1f, 0.82f, 0.32f),
            ShopKind.CarDealer => new Color(0.4f, 0.72f, 1f),
            _ => new Color(0.4f, 1f, 0.55f),
        };

        string SignText => safehouse ? "SAFEHOUSE" : kind switch
        {
            ShopKind.GunStore => "IRONSIGHTS ARMORY",
            ShopKind.Hospital => "+  VISTA GENERAL",
            ShopKind.Convenience => "FUEL & GO",
            ShopKind.CarDealer => "VERANO MOTORS",
            _ => label.ToUpperInvariant(),
        };

        string Icon => safehouse ? "H" : kind switch
        {
            ShopKind.GunStore => "G",
            ShopKind.Hospital => "+",
            ShopKind.Convenience => "F",
            ShopKind.CarDealer => "C",
            _ => "",
        };

        void Start()
        {
            if (Physics.Raycast(transform.position + Vector3.up * 300f, Vector3.down, out var hit, 600f, ~0, QueryTriggerInteraction.Ignore))
                transform.position = new Vector3(transform.position.x, hit.point.y, transform.position.z);

            _exteriorReturn = transform.position + Vector3.up * 0.2f;
            _exteriorYaw = transform.eulerAngles.y;

            var c = Accent;
            BuildBeacon(c);
            BuildSign(c, SignText);
            Blip.Attach(gameObject, BlipKind.Shop, c, SignText, Icon);

            // Enterable hospitals are valid Wasted respawn points.
            if (!safehouse && kind == ShopKind.Hospital) ServiceBuilding.HospitalPoints.Add(_exteriorReturn);
        }

        public override void Interact(GameObject player)
        {
            EnsureInterior();
            // A dealership delivers purchased cars to its street door (player is off-map inside).
            if (!safehouse && kind == ShopKind.CarDealer)
            {
                float y = _exteriorYaw * Mathf.Deg2Rad;
                ShopMenu.CarDeliveryPoint = _exteriorReturn + new Vector3(Mathf.Sin(y), 0f, Mathf.Cos(y)) * 7f;
            }
            PlayerInside = true; // stop WorldBounds from yanking the player off the off-map interior
            Teleport(_interiorSpawn, _interiorYaw);
        }

        public void ExitToStreet()
        {
            ShopMenu.CarDeliveryPoint = null;
            PlayerInside = false;
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

            // Off-map origin, staggered per interior so multiple never collide.
            Vector3 o = new Vector3(1600f + (_interiorSlot++) * 120f, 200f, 1600f);
            var room = new GameObject("Interior_" + label);
            room.transform.position = o;

            bool dealership = !safehouse && kind == ShopKind.CarDealer;
            float w = dealership ? 22f : 12f, d = dealership ? 18f : 9f, h = dealership ? 6f : 4f;

            var (floorC, wallC) = safehouse ? (new Color(0.28f, 0.22f, 0.16f), new Color(0.36f, 0.29f, 0.24f))
                : kind switch
                {
                    ShopKind.Hospital => (new Color(0.72f, 0.75f, 0.78f), new Color(0.9f, 0.92f, 0.95f)),
                    ShopKind.Convenience => (new Color(0.3f, 0.3f, 0.32f), new Color(0.52f, 0.5f, 0.42f)),
                    ShopKind.CarDealer => (new Color(0.3f, 0.31f, 0.34f), new Color(0.82f, 0.85f, 0.9f)),
                    _ => (new Color(0.22f, 0.2f, 0.22f), new Color(0.3f, 0.28f, 0.3f)),
                };
            var floorMat = Mat(floorC);
            var wallMat = Mat(wallC);
            var counterMat = Mat(new Color(0.45f, 0.3f, 0.22f));

            Box(room.transform, "Floor", new Vector3(0, -0.25f, 0), new Vector3(w, 0.5f, d), floorMat);
            Box(room.transform, "Ceiling", new Vector3(0, h, 0), new Vector3(w, 0.3f, d), floorMat);
            Box(room.transform, "WallBack", new Vector3(0, h * 0.5f, d * 0.5f), new Vector3(w, h, 0.3f), wallMat);
            Box(room.transform, "WallLeft", new Vector3(-w * 0.5f, h * 0.5f, 0), new Vector3(0.3f, h, d), wallMat);
            Box(room.transform, "WallRight", new Vector3(w * 0.5f, h * 0.5f, 0), new Vector3(0.3f, h, d), wallMat);
            Box(room.transform, "WallFrontL", new Vector3(-w * 0.32f, h * 0.5f, -d * 0.5f), new Vector3(w * 0.36f, h, 0.3f), wallMat);
            Box(room.transform, "WallFrontR", new Vector3(w * 0.32f, h * 0.5f, -d * 0.5f), new Vector3(w * 0.36f, h, 0.3f), wallMat);

            // Interior lights (closed ceiling).
            Light(room.transform, new Vector3(0, h - 0.6f, d * 0.2f), Accent, dealership ? 24f : 18f);
            if (dealership) Light(room.transform, new Vector3(0, h - 0.6f, -d * 0.2f), Color.white, 24f);

            // Interior signage on the back wall so the room reads real.
            WallSign(room.transform, new Vector3(0, h * 0.72f, d * 0.5f - 0.2f), SignText, Accent);

            // Themed props + counter service.
            var counter = new GameObject("Counter Interact");
            counter.transform.position = o + new Vector3(0, 0, d * 0.28f - 1.2f);

            switch (safehouse ? (ShopKind)(-1) : kind)
            {
                case ShopKind.Hospital: BuildHospital(room.transform, w, d, counterMat); break;
                case ShopKind.Convenience: BuildConvenience(room.transform, w, d, counterMat); break;
                case ShopKind.CarDealer: BuildDealership(room.transform, w, d); break;
                case (ShopKind)(-1): BuildSafehouse(room.transform, w, d, counterMat); break;
                default: Box(room.transform, "Counter", new Vector3(0, 0.55f, d * 0.28f), new Vector3(w * 0.7f, 1.1f, 0.8f), counterMat); break;
            }

            if (safehouse) counter.AddComponent<SafehouseDesk>().range = 3.4f;
            else { var shop = counter.AddComponent<Shop>(); shop.kind = kind; shop.range = 3.4f; }

            // Exit door near the entrance.
            var exit = new GameObject("Exit Door");
            exit.transform.position = o + new Vector3(0, 0, -d * 0.5f + 1.2f);
            var door = exit.AddComponent<ShopExitDoor>();
            door.shop = this; door.range = 3.4f;

            _interiorSpawn = o + new Vector3(0, 0.2f, -d * 0.5f + 2.5f);
            _interiorYaw = 0f; // face the counter (+Z)
        }

        // ── Themed layouts ────────────────────────────────────────────────────────
        void BuildHospital(Transform room, float w, float d, Material counterMat)
        {
            Box(room, "Reception", new Vector3(0, 0.55f, d * 0.28f), new Vector3(w * 0.7f, 1.1f, 0.8f), counterMat);
            var bedMat = Mat(new Color(0.85f, 0.88f, 0.92f));
            var sheetMat = Mat(new Color(0.6f, 0.85f, 0.95f));
            for (int i = 0; i < 2; i++)
            {
                float x = (i == 0 ? -1 : 1) * w * 0.32f;
                Box(room, "Bed" + i, new Vector3(x, 0.35f, -d * 0.1f), new Vector3(1.0f, 0.5f, 2.1f), bedMat);
                Box(room, "Sheet" + i, new Vector3(x, 0.62f, -d * 0.02f), new Vector3(1.0f, 0.08f, 1.2f), sheetMat);
            }
            // Red cross on the back wall.
            var crossMat = Mat(new Color(0.9f, 0.2f, 0.24f));
            Box(room, "CrossV", new Vector3(-w * 0.32f, 2.5f, d * 0.5f - 0.25f), new Vector3(0.28f, 1.1f, 0.1f), crossMat);
            Box(room, "CrossH", new Vector3(-w * 0.32f, 2.5f, d * 0.5f - 0.25f), new Vector3(0.9f, 0.28f, 0.1f), crossMat);
        }

        void BuildConvenience(Transform room, float w, float d, Material counterMat)
        {
            Box(room, "Register", new Vector3(-w * 0.22f, 0.55f, d * 0.28f), new Vector3(w * 0.4f, 1.1f, 0.8f), counterMat);
            var shelfMat = Mat(new Color(0.55f, 0.55f, 0.58f));
            var goodsMat = Mat(new Color(0.8f, 0.5f, 0.3f));
            for (int r = 0; r < 3; r++)
            {
                float z = -d * 0.28f + r * 2.4f;
                Box(room, "Shelf" + r, new Vector3(w * 0.22f, 0.7f, z), new Vector3(w * 0.42f, 1.4f, 0.6f), shelfMat);
                Box(room, "Goods" + r, new Vector3(w * 0.22f, 1.5f, z), new Vector3(w * 0.4f, 0.25f, 0.5f), goodsMat);
            }
            // Fridge along the back.
            Box(room, "Fridge", new Vector3(-w * 0.35f, 1.2f, d * 0.42f), new Vector3(1.6f, 2.4f, 0.7f), Mat(new Color(0.7f, 0.85f, 0.95f)));
        }

        void BuildDealership(Transform room, float w, float d)
        {
            // Sales desk to the side.
            Box(room, "SalesDesk", new Vector3(-w * 0.34f, 0.55f, d * 0.3f), new Vector3(w * 0.25f, 1.1f, 1.0f), Mat(new Color(0.2f, 0.22f, 0.28f)));
            // A raised showroom platform with a few display cars.
            var platMat = Mat(new Color(0.2f, 0.21f, 0.24f));
            Box(room, "Platform", new Vector3(w * 0.12f, 0.1f, 0f), new Vector3(w * 0.66f, 0.2f, d * 0.7f), platMat);
            Color[] cols = { new Color(0.85f, 0.2f, 0.2f), new Color(0.2f, 0.4f, 0.85f), new Color(0.95f, 0.8f, 0.2f) };
            for (int i = 0; i < 3; i++)
            {
                float z = -d * 0.24f + i * (d * 0.24f);
                DisplayCar(room, new Vector3(w * 0.12f, 0.2f, z), 90f, cols[i]);
            }
        }

        void BuildSafehouse(Transform room, float w, float d, Material counterMat)
        {
            // Save desk.
            Box(room, "Desk", new Vector3(w * 0.28f, 0.55f, d * 0.28f), new Vector3(w * 0.36f, 1.1f, 0.8f), counterMat);
            // Couch + coffee table + a wall TV — cosy.
            var couchMat = Mat(new Color(0.35f, 0.4f, 0.5f));
            Box(room, "Couch", new Vector3(-w * 0.22f, 0.4f, -d * 0.1f), new Vector3(2.6f, 0.8f, 0.9f), couchMat);
            Box(room, "CouchBack", new Vector3(-w * 0.22f, 0.8f, -d * 0.1f - 0.4f), new Vector3(2.6f, 0.7f, 0.2f), couchMat);
            Box(room, "Table", new Vector3(-w * 0.22f, 0.3f, d * 0.06f), new Vector3(1.3f, 0.25f, 0.7f), Mat(new Color(0.3f, 0.22f, 0.16f)));
            Box(room, "TV", new Vector3(-w * 0.48f + 0.2f, 1.5f, d * 0.06f), new Vector3(0.12f, 1.0f, 1.8f), Mat(new Color(0.05f, 0.05f, 0.07f)));
        }

        void DisplayCar(Transform room, Vector3 localPos, float yaw, Color color)
        {
            var car = new GameObject("DisplayCar");
            car.transform.SetParent(room, false);
            car.transform.localPosition = localPos;
            car.transform.localRotation = Quaternion.Euler(0, yaw, 0);
            var body = Mat(color);
            var glass = Mat(new Color(0.1f, 0.12f, 0.16f));
            var tire = Mat(new Color(0.06f, 0.06f, 0.07f));
            Box(car.transform, "Body", new Vector3(0, 0.55f, 0), new Vector3(1.9f, 0.7f, 4.2f), body);
            Box(car.transform, "Cabin", new Vector3(0, 1.05f, -0.2f), new Vector3(1.7f, 0.6f, 2.0f), glass);
            for (int i = 0; i < 4; i++)
            {
                float sx = (i % 2 == 0 ? -1 : 1) * 0.85f;
                float sz = (i < 2 ? 1 : -1) * 1.35f;
                var wheel = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                var col = wheel.GetComponent<Collider>(); if (col) Destroy(col);
                wheel.name = "Wheel";
                wheel.transform.SetParent(car.transform, false);
                wheel.transform.localPosition = new Vector3(sx, 0.35f, sz);
                wheel.transform.localRotation = Quaternion.Euler(0, 0, 90f);
                wheel.transform.localScale = new Vector3(0.7f, 0.18f, 0.7f);
                wheel.GetComponent<MeshRenderer>().sharedMaterial = tire;
            }
        }

        // ── Building blocks ────────────────────────────────────────────────────────
        void BuildBeacon(Color c)
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

        static void Light(Transform parent, Vector3 localPos, Color c, float range)
        {
            var lightGo = new GameObject("Light");
            lightGo.transform.SetParent(parent, false);
            lightGo.transform.localPosition = localPos;
            var l = lightGo.AddComponent<UnityEngine.Light>();
            l.type = LightType.Point; l.range = range; l.intensity = 2.2f; l.color = c * 0.5f + Color.white * 0.5f;
        }

        void BuildSign(Color c, string text)
        {
            var signGo = new GameObject("Sign");
            signGo.transform.SetParent(transform, false);
            signGo.transform.localPosition = new Vector3(0f, 4.3f, 0f);
            var canvas = signGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            var crt = (RectTransform)signGo.transform;
            crt.sizeDelta = new Vector2(560, 150);
            signGo.transform.localScale = Vector3.one * 0.011f;

            var bg = new GameObject("bg", typeof(Image));
            bg.transform.SetParent(signGo.transform, false);
            bg.GetComponent<Image>().color = new Color(c.r * 0.18f, c.g * 0.18f, c.b * 0.18f, 0.95f);
            Stretch((RectTransform)bg.transform);

            var t = new GameObject("t", typeof(Text));
            t.transform.SetParent(signGo.transform, false);
            var txt = t.GetComponent<Text>();
            txt.text = text; txt.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            txt.fontSize = 62; txt.fontStyle = FontStyle.Bold; txt.alignment = TextAnchor.MiddleCenter;
            txt.color = new Color(Mathf.Min(1f, c.r + 0.35f), Mathf.Min(1f, c.g + 0.35f), Mathf.Min(1f, c.b + 0.35f));
            txt.horizontalOverflow = HorizontalWrapMode.Overflow;
            Stretch((RectTransform)t.transform);
            _sign = signGo.transform;
        }

        void WallSign(Transform room, Vector3 localPos, string text, Color c)
        {
            var signGo = new GameObject("WallSign");
            signGo.transform.SetParent(room, false);
            signGo.transform.localPosition = localPos;
            signGo.transform.localRotation = Quaternion.Euler(0, 180f, 0); // face into the room (-Z)
            var canvas = signGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            var crt = (RectTransform)signGo.transform;
            crt.sizeDelta = new Vector2(600, 120);
            signGo.transform.localScale = Vector3.one * 0.006f;
            var t = new GameObject("t", typeof(Text));
            t.transform.SetParent(signGo.transform, false);
            var txt = t.GetComponent<Text>();
            txt.text = text; txt.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            txt.fontSize = 80; txt.fontStyle = FontStyle.Bold; txt.alignment = TextAnchor.MiddleCenter;
            txt.color = new Color(Mathf.Min(1f, c.r + 0.3f), Mathf.Min(1f, c.g + 0.3f), Mathf.Min(1f, c.b + 0.3f));
            txt.horizontalOverflow = HorizontalWrapMode.Overflow;
            Stretch((RectTransform)t.transform);
        }

        void LateUpdate()
        {
            if (_sign == null) return;
            var cam = Camera.main;
            if (cam != null) _sign.rotation = Quaternion.LookRotation(_sign.position - cam.transform.position);
        }

        static Material Mat(Color c) => new Material(Shader.Find("Universal Render Pipeline/Lit")) { color = c };

        static void Box(Transform parent, string name, Vector3 localPos, Vector3 size, Material mat)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = size;
            go.GetComponent<MeshRenderer>().sharedMaterial = mat;
        }

        static void Stretch(RectTransform rt)
        {
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
            rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
        }
    }
}
