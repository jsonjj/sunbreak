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

        void Start()
        {
            if (Physics.Raycast(transform.position + Vector3.up * 300f, Vector3.down, out var hit, 600f, ~0, QueryTriggerInteraction.Ignore))
                transform.position = new Vector3(transform.position.x, hit.point.y, transform.position.z);

            _marker = GameObject.CreatePrimitive(PrimitiveType.Cube);
            _marker.name = "cash";
            Destroy(_marker.GetComponent<Collider>());
            _marker.transform.SetParent(transform, false);
            _marker.transform.localScale = new Vector3(0.5f, 0.28f, 0.9f);
            _marker.transform.localPosition = new Vector3(0f, 0.8f, 0f);
            var mat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = new Color(0.35f, 0.9f, 0.4f) };
            _marker.GetComponent<MeshRenderer>().sharedMaterial = mat;
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
    }
}
