using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>A spinning cash pickup. Web pickup radius is 2.2 m. Respawns after a delay so the
    /// world stays lively.</summary>
    public sealed class CashPickup : MonoBehaviour
    {
        public int amount = 250;
        public float radius = 2.2f;
        public float respawnDelay = 30f;

        GameObject _marker;
        float _readyAt;
        static Material _billMat, _bandMat, _beaconMat;

        void Start()
        {
            if (Physics.Raycast(transform.position + Vector3.up * 300f, Vector3.down, out var hit, 600f, ~0, QueryTriggerInteraction.Ignore))
                transform.position = new Vector3(transform.position.x, hit.point.y, transform.position.z);

            EnsureMats();
            _marker = new GameObject("cash");
            _marker.transform.SetParent(transform, false);
            _marker.transform.localPosition = new Vector3(0f, 0.85f, 0f);

            // A clear "cash wad": a green bill stack with a gold band — reads as money, not an NPC.
            var bills = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Destroy(bills.GetComponent<Collider>());
            bills.name = "bills";
            bills.transform.SetParent(_marker.transform, false);
            bills.transform.localScale = new Vector3(0.34f, 0.24f, 0.5f);
            bills.GetComponent<MeshRenderer>().sharedMaterial = _billMat;

            var band = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Destroy(band.GetComponent<Collider>());
            band.name = "band";
            band.transform.SetParent(_marker.transform, false);
            band.transform.localScale = new Vector3(0.36f, 0.10f, 0.14f);
            band.GetComponent<MeshRenderer>().sharedMaterial = _bandMat;

            // Thin beacon column so it's spotted from a distance like the other pickups.
            var beacon = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            Destroy(beacon.GetComponent<Collider>());
            beacon.name = "beacon";
            beacon.transform.SetParent(transform, false);
            beacon.transform.localScale = new Vector3(0.14f, 2.6f, 0.14f);
            beacon.transform.localPosition = new Vector3(0f, 2.6f, 0f);
            beacon.GetComponent<MeshRenderer>().sharedMaterial = _beaconMat;

            Blip.Attach(gameObject, BlipKind.Cash, new Color(0.35f, 0.9f, 0.4f), "Cash");
        }

        void Update()
        {
            if (!_marker.activeSelf)
            {
                if (Time.time >= _readyAt) _marker.SetActive(true);
                return;
            }
            _marker.transform.Rotate(0f, 120f * Time.deltaTime, 0f, Space.Self);
            _marker.transform.localPosition = new Vector3(0f, 0.85f + Mathf.Sin(Time.time * 2.5f) * 0.08f, 0f); // gentle bob

            var player = GameRefs.Player;
            var state = GameRefs.PlayerState;
            if (player == null || state == null) return;
            Vector3 d = player.position - transform.position; d.y = 0f;
            if (d.sqrMagnitude <= radius * radius)
            {
                state.AddCash(amount);
                _marker.SetActive(false);
                _readyAt = Time.time + respawnDelay;
            }
        }

        static void EnsureMats()
        {
            if (_billMat != null) return;
            var sh = Shader.Find("Universal Render Pipeline/Unlit");
            _billMat = new Material(sh) { color = new Color(0.30f, 0.72f, 0.38f) };  // banknote green
            _bandMat = new Material(sh) { color = new Color(0.95f, 0.8f, 0.25f) };   // gold band
            _beaconMat = new Material(sh) { color = new Color(0.4f, 1f, 0.5f, 1f) }; // bright beacon
        }
    }
}
