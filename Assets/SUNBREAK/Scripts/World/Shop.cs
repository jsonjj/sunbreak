using UnityEngine;
using SUNBREAK.UI;

namespace SUNBREAK.World
{
    /// <summary>A storefront the player uses with E. Places a colored beacon + map blip so it can
    /// be found across the districts.</summary>
    public sealed class Shop : Interactable
    {
        public ShopKind kind = ShopKind.GunStore;

        // Gun store + dealership keep retail hours; the ATM/bank is 24h.
        bool ClosedNow => (kind == ShopKind.GunStore || kind == ShopKind.CarDealer) && !DayNightSystem.BusinessHours;

        public override string Prompt => kind switch
        {
            ShopKind.GunStore => ClosedNow ? "Gun Store — Closed (06:00–21:00)" : "Press E — Gun Store",
            ShopKind.CarDealer => ClosedNow ? "Car Dealership — Closed (06:00–21:00)" : "Press E — Car Dealership",
            _ => "Press E — Bank / ATM",
        };

        public override bool Available => ShopMenu.Instance == null || !ShopMenu.Instance.IsOpen;

        public override void Interact(GameObject player)
        {
            if (ClosedNow) { SUNBREAK.UI.GameHUD.Post("CLOSED", "Open 06:00–21:00. Come back in daylight."); return; }
            ShopMenu.Instance?.Open(kind);
        }

        void Start()
        {
            if (Physics.Raycast(transform.position + Vector3.up * 300f, Vector3.down, out var hit, 600f, ~0, QueryTriggerInteraction.Ignore))
                transform.position = new Vector3(transform.position.x, hit.point.y, transform.position.z);

            Color c = kind switch
            {
                ShopKind.GunStore => new Color(1f, 0.4f, 0.3f),
                ShopKind.CarDealer => new Color(0.4f, 0.7f, 1f),
                _ => new Color(0.4f, 1f, 0.55f),
            };
            BuildBeacon(c);
            Blip.Attach(gameObject, BlipKind.Shop, c, Prompt);
        }

        void BuildBeacon(Color c)
        {
            var beacon = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            beacon.name = "beacon";
            Destroy(beacon.GetComponent<Collider>());
            beacon.transform.SetParent(transform, false);
            beacon.transform.localScale = new Vector3(0.4f, 6f, 0.4f);
            beacon.transform.localPosition = new Vector3(0f, 6f, 0f);
            var mat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = c };
            var r = beacon.GetComponent<MeshRenderer>();
            r.sharedMaterial = mat; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }
    }
}
