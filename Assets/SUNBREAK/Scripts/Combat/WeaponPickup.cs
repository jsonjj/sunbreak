using UnityEngine;
using SUNBREAK.UI;
using SUNBREAK.World;

namespace SUNBREAK.Combat
{
    /// <summary>
    /// World weapon pickup: a spinning marker + beacon + map blip. Shows a "Press E — Pick up X"
    /// prompt when near (and auto-grabs on a close walk-over), grants a REAL usable weapon to the
    /// player's <see cref="PlayerCombat"/>, toasts it, then respawns after a delay.
    /// </summary>
    public sealed class WeaponPickup : Interactable
    {
        public string weaponId = "rifle_carbine";
        public float respawnDelay = 25f;

        Transform _marker;
        float _readyAt;
        bool _taken;

        public override string Prompt => _taken ? "" : $"Press E — Pick up {Weapons.Get(weaponId).name}";
        public override bool Available => !_taken && isActiveAndEnabled;

        void Start()
        {
            range = 2.6f;
            if (Physics.Raycast(transform.position + Vector3.up * 300f, Vector3.down, out var hit, 600f, ~0, QueryTriggerInteraction.Ignore))
                transform.position = new Vector3(transform.position.x, hit.point.y, transform.position.z);
            BuildMarker();
            Blip.Attach(gameObject, BlipKind.Cash, new Color(1f, 0.6f, 0.25f), "Weapon");
        }

        void BuildMarker()
        {
            var box = GameObject.CreatePrimitive(PrimitiveType.Cube);
            box.name = "marker";
            var c = box.GetComponent<Collider>(); if (c) Destroy(c);
            box.transform.SetParent(transform, false);
            box.transform.localScale = new Vector3(0.9f, 0.22f, 0.25f);
            box.transform.localPosition = new Vector3(0f, 1.0f, 0f);
            var mr = box.GetComponent<MeshRenderer>();
            mr.sharedMaterial = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = new Color(1f, 0.6f, 0.25f) };
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            var beacon = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            beacon.name = "beacon";
            var bc = beacon.GetComponent<Collider>(); if (bc) Destroy(bc);
            beacon.transform.SetParent(transform, false);
            beacon.transform.localScale = new Vector3(0.25f, 3.5f, 0.25f);
            beacon.transform.localPosition = new Vector3(0f, 3.5f, 0f);
            var bmr = beacon.GetComponent<MeshRenderer>();
            bmr.sharedMaterial = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = new Color(1f, 0.6f, 0.25f, 0.6f) };
            bmr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            _marker = box.transform;
        }

        public override void Interact(GameObject player) => Grab();

        void Update()
        {
            if (_taken)
            {
                if (Time.time >= _readyAt) { _taken = false; if (_marker) _marker.parent.gameObject.SetActive(true); SetVisible(true); }
                return;
            }
            if (_marker != null) _marker.localRotation = Quaternion.Euler(0f, Time.time * 90f, 0f);

            // Convenience walk-over grab.
            var p = GameRefs.Player;
            if (p != null && (p.position - transform.position).sqrMagnitude <= 1.4f * 1.4f) Grab();
        }

        void Grab()
        {
            if (_taken) return;
            var combat = GameRefs.Player != null ? GameRefs.Player.GetComponent<PlayerCombat>() : null;
            if (combat == null) return;
            combat.Pickup(weaponId);
            GameHUD.Post("PICKED UP", Weapons.Get(weaponId).name);
            _taken = true;
            _readyAt = Time.time + respawnDelay;
            SetVisible(false);
        }

        void SetVisible(bool on)
        {
            foreach (var mr in GetComponentsInChildren<MeshRenderer>(true)) mr.enabled = on;
        }
    }
}
