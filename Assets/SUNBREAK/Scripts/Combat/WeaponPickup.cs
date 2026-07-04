using UnityEngine;
using SUNBREAK.World;

namespace SUNBREAK.Combat
{
    /// <summary>
    /// Walk-over weapon pickup: a spinning marker that grants its weapon to the player's
    /// <see cref="PlayerCombat"/> on proximity, then respawns after a delay (port of the web
    /// build's world weapon pickups). One is placed near spawn so the player is armed up quickly.
    /// </summary>
    public sealed class WeaponPickup : MonoBehaviour
    {
        public string weaponId = "rifle_carbine";
        public float radius = 1.8f;
        public float respawnDelay = 20f;

        Transform _player;
        PlayerCombat _combat;
        Transform _marker;
        float _readyAt;

        void Start()
        {
            _player = GameRefs.Player;
            _combat = _player != null ? _player.GetComponent<PlayerCombat>() : null;
            BuildMarker();
        }

        void BuildMarker()
        {
            var box = GameObject.CreatePrimitive(PrimitiveType.Cube);
            box.name = "marker";
            var c = box.GetComponent<Collider>(); if (c) Destroy(c);
            box.transform.SetParent(transform, false);
            box.transform.localScale = new Vector3(0.9f, 0.22f, 0.25f);
            var mr = box.GetComponent<MeshRenderer>();
            mr.sharedMaterial = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = new Color(1f, 0.6f, 0.25f) };
            _marker = box.transform;
        }

        void Update()
        {
            if (_marker != null && _marker.gameObject.activeSelf)
                _marker.localRotation = Quaternion.Euler(0f, Time.time * 90f, 0f);

            if (_readyAt > 0f)
            {
                if (Time.time >= _readyAt) { _readyAt = 0f; if (_marker) _marker.gameObject.SetActive(true); }
                return;
            }
            if (_player == null) { _player = GameRefs.Player; _combat = _player != null ? _player.GetComponent<PlayerCombat>() : null; }
            if (_player == null || _combat == null) return;
            if ((_player.position - transform.position).sqrMagnitude <= radius * radius)
            {
                _combat.Pickup(weaponId);
                if (_marker) _marker.gameObject.SetActive(false);
                _readyAt = Time.time + respawnDelay;
            }
        }
    }
}
