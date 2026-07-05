using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using SUNBREAK.Combat;
using SUNBREAK.Save;
using SUNBREAK.UI;
using SUNBREAK.Vehicles;

namespace SUNBREAK.World
{
    public enum ServiceKind { Hospital, Respray, Safehouse, Fuel }

    /// <summary>
    /// A walk-up functional service building (press E). Gives the label-only POIs real behaviour +
    /// clear signage: HOSPITAL heals for a fee (and is the Wasted respawn point), VERANO CUSTOMS
    /// repairs the car + sheds wanted when out of police sight, SAFEHOUSE saves the game, FUEL &amp; GO
    /// sells snacks + armor. Each gets a coloured beacon, a name board, a map blip, and an E prompt.
    /// </summary>
    public sealed class ServiceBuilding : Interactable
    {
        public ServiceKind kind = ServiceKind.Hospital;

        /// <summary>All hospitals — the Wasted flow respawns at the nearest one.</summary>
        public static readonly List<ServiceBuilding> Hospitals = new();

        /// <summary>Street-side respawn points for every hospital (ServiceBuilding OR enterable
        /// hospital) so the Wasted flow always has a door to drop you at.</summary>
        public static readonly List<Vector3> HospitalPoints = new();

        Transform _sign;

        public override string Prompt => kind switch
        {
            ServiceKind.Hospital => "Press E \u2014 Vista General (heal / meds)",
            ServiceKind.Respray => "Press E \u2014 Verano Customs (repair / respray)",
            ServiceKind.Safehouse => "Press E \u2014 Safehouse (save game)",
            ServiceKind.Fuel => "Press E \u2014 Fuel & Go (snacks / armor)",
            _ => "Press E",
        };

        public override bool Available => ShopMenu.Instance == null || !ShopMenu.Instance.IsOpen;

        Color Tint => kind switch
        {
            ServiceKind.Hospital => new Color(1f, 0.32f, 0.36f),
            ServiceKind.Respray => new Color(0.4f, 0.72f, 1f),
            ServiceKind.Safehouse => new Color(0.45f, 0.9f, 0.6f),
            ServiceKind.Fuel => new Color(1f, 0.82f, 0.32f),
            _ => Color.white,
        };

        string SignText => kind switch
        {
            ServiceKind.Hospital => "+  VISTA GENERAL",
            ServiceKind.Respray => "VERANO CUSTOMS",
            ServiceKind.Safehouse => "SAFEHOUSE",
            ServiceKind.Fuel => "FUEL & GO",
            _ => "",
        };

        void Start()
        {
            if (Physics.Raycast(transform.position + Vector3.up * 300f, Vector3.down, out var hit, 600f, ~0, QueryTriggerInteraction.Ignore))
                transform.position = new Vector3(transform.position.x, hit.point.y, transform.position.z);

            BuildBeacon(Tint);
            BuildSign(Tint, SignText);
            Blip.Attach(gameObject, BlipKind.Shop, Tint, SignText);
            if (kind == ServiceKind.Hospital) { Hospitals.Add(this); HospitalPoints.Add(transform.position); }
        }

        protected override void OnDisable()
        {
            base.OnDisable();
            Hospitals.Remove(this);
        }

        public override void Interact(GameObject player)
        {
            switch (kind)
            {
                case ServiceKind.Hospital: ShopMenu.Instance?.Open(ShopKind.Hospital); break;
                case ServiceKind.Fuel: ShopMenu.Instance?.Open(ShopKind.Convenience); break;
                case ServiceKind.Safehouse: DoSafehouse(); break;
                case ServiceKind.Respray: DoRespray(); break;
            }
        }

        void DoSafehouse()
        {
            GameSession.Instance?.SaveToSlot(1);
            GameHUD.Post("SAFEHOUSE", "Progress saved to Slot 1.");
        }

        void DoRespray()
        {
            var veh = FindFirstObjectByType<VehicleInteraction>();
            var car = veh != null ? veh.CurrentCar : null;
            bool repaired = false;
            if (car != null && car.TryGetComponent<CarHealth>(out var hp)) { hp.Repair(); repaired = true; }

            var ws = WantedSystem.Instance;
            if (ws != null && ws.Stars > 0)
            {
                if (ws.PoliceHaveSight) GameHUD.Post("VERANO CUSTOMS", "Can't respray \u2014 police have eyes on you!");
                else { ws.Clear(); GameHUD.Post("VERANO CUSTOMS", "Fresh paint. Wanted level lost."); }
            }
            else
            {
                GameHUD.Post("VERANO CUSTOMS", repaired ? "Vehicle repaired." : "Drive a vehicle in for a repair + respray.");
            }
        }

        /// <summary>Nearest hospital position for the Wasted respawn (falls back to canon spawn).</summary>
        public static Vector3 NearestHospital(Vector3 from)
        {
            Vector3 best = Geography.PLAYER_SPAWN.position;
            float bestSq = float.MaxValue;
            foreach (var p in HospitalPoints)
            {
                float sq = (p - from).sqrMagnitude;
                if (sq < bestSq) { bestSq = sq; best = p; }
            }
            return best;
        }

        // ── Visuals ─────────────────────────────────────────────────────────────
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
            Stretch((RectTransform)bg.transform, 0f);

            var bar = new GameObject("bar", typeof(Image));
            bar.transform.SetParent(signGo.transform, false);
            bar.GetComponent<Image>().color = c;
            var brt = (RectTransform)bar.transform;
            brt.anchorMin = new Vector2(0f, 0f); brt.anchorMax = new Vector2(1f, 0f); brt.pivot = new Vector2(0.5f, 0f);
            brt.sizeDelta = new Vector2(0f, 16f); brt.anchoredPosition = Vector2.zero;

            var t = new GameObject("t", typeof(Text));
            t.transform.SetParent(signGo.transform, false);
            var txt = t.GetComponent<Text>();
            txt.text = text; txt.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            txt.fontSize = 66; txt.fontStyle = FontStyle.Bold; txt.alignment = TextAnchor.MiddleCenter;
            txt.color = new Color(Mathf.Min(1f, c.r + 0.35f), Mathf.Min(1f, c.g + 0.35f), Mathf.Min(1f, c.b + 0.35f));
            txt.horizontalOverflow = HorizontalWrapMode.Overflow;
            Stretch((RectTransform)t.transform, 0f);

            _sign = signGo.transform;
        }

        void LateUpdate()
        {
            if (_sign == null) return;
            var cam = Camera.main;
            if (cam != null) _sign.rotation = Quaternion.LookRotation(_sign.position - cam.transform.position);
        }

        static void Stretch(RectTransform rt, float pad)
        {
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
            rt.offsetMin = new Vector2(pad, pad); rt.offsetMax = new Vector2(-pad, -pad);
        }
    }
}
