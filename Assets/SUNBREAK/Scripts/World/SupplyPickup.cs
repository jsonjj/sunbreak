using UnityEngine;
using SUNBREAK.UI;

namespace SUNBREAK.World
{
    public enum SupplyKind { Medkit, Armor }

    /// <summary>A walk-over health/armor pickup (clone of <see cref="CashPickup"/>): a spinning marker
    /// that heals or adds armor, posts a toast, and respawns after a delay so the world stays supplied.</summary>
    public sealed class SupplyPickup : MonoBehaviour
    {
        public SupplyKind kind = SupplyKind.Medkit;
        public float amount = 25f;
        public float radius = 1.9f;
        public float respawnDelay = 40f;

        GameObject _marker;
        float _readyAt;
        static Material _medMat, _armorMat, _beaconMat;

        Color Tint => kind == SupplyKind.Medkit ? new Color(0.95f, 0.25f, 0.25f) : new Color(0.35f, 0.6f, 1f);

        void Start()
        {
            if (Physics.Raycast(transform.position + Vector3.up * 300f, Vector3.down, out var hit, 600f, ~0, QueryTriggerInteraction.Ignore))
                transform.position = new Vector3(transform.position.x, hit.point.y, transform.position.z);

            EnsureMats();
            _marker = new GameObject(kind.ToString());
            _marker.transform.SetParent(transform, false);
            _marker.transform.localPosition = new Vector3(0f, 0.9f, 0f);

            var body = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Destroy(body.GetComponent<Collider>());
            body.name = "body";
            body.transform.SetParent(_marker.transform, false);
            body.transform.localScale = kind == SupplyKind.Medkit ? new Vector3(0.42f, 0.3f, 0.42f) : new Vector3(0.36f, 0.5f, 0.12f);
            body.GetComponent<MeshRenderer>().sharedMaterial = kind == SupplyKind.Medkit ? _medMat : _armorMat;

            var beacon = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            Destroy(beacon.GetComponent<Collider>());
            beacon.name = "beacon";
            beacon.transform.SetParent(transform, false);
            beacon.transform.localScale = new Vector3(0.12f, 2.4f, 0.12f);
            beacon.transform.localPosition = new Vector3(0f, 2.4f, 0f);
            var bmr = beacon.GetComponent<MeshRenderer>();
            bmr.sharedMaterial = kind == SupplyKind.Medkit ? _medMat : _armorMat;
            bmr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            Blip.Attach(gameObject, BlipKind.Activity, Tint, kind == SupplyKind.Medkit ? "Medkit" : "Armor");
        }

        void Update()
        {
            if (!_marker.activeSelf)
            {
                if (Time.time >= _readyAt) _marker.SetActive(true);
                return;
            }
            _marker.transform.Rotate(0f, 110f * Time.deltaTime, 0f, Space.Self);
            _marker.transform.localPosition = new Vector3(0f, 0.9f + Mathf.Sin(Time.time * 2.6f) * 0.08f, 0f);

            var player = GameRefs.Player;
            var state = GameRefs.PlayerState;
            if (player == null || state == null) return;
            Vector3 d = player.position - transform.position; d.y = 0f;
            if (d.sqrMagnitude > radius * radius) return;

            bool took = false;
            if (kind == SupplyKind.Medkit)
            {
                if (state.Health < state.MaxHealth) { state.Heal(amount); GameHUD.Post("MEDKIT", $"+{Mathf.RoundToInt(amount)} health"); took = true; }
            }
            else
            {
                if (state.Armor < state.MaxArmor) { state.AddArmor(amount); GameHUD.Post("ARMOR", $"+{Mathf.RoundToInt(amount)} armor"); took = true; }
            }
            if (took) { _marker.SetActive(false); _readyAt = Time.time + respawnDelay; }
        }

        static void EnsureMats()
        {
            if (_medMat != null) return;
            var sh = Shader.Find("Universal Render Pipeline/Unlit");
            _medMat = new Material(sh) { color = new Color(0.95f, 0.25f, 0.25f) };
            _armorMat = new Material(sh) { color = new Color(0.35f, 0.6f, 1f) };
            _beaconMat = new Material(sh) { color = new Color(0.8f, 0.9f, 1f) };
        }
    }
}
