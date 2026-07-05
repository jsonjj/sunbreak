using UnityEngine;
using UnityEngine.InputSystem;
using SUNBREAK.Cameras;
using SUNBREAK.Player;
using SUNBREAK.World;

namespace SUNBREAK.Vehicles
{
    /// <summary>
    /// On-foot ⇄ driving toggle (F). When on foot and near a car, enter it: lock the player's
    /// movement + hide the character, hand control to the <see cref="ArcadeCarController"/>,
    /// and point the shared camera rig at the car. Pressing F again drops the player back out
    /// beside the car. Look input stays live throughout so the camera keeps orbiting.
    /// </summary>
    public sealed class VehicleInteraction : MonoBehaviour
    {
        public PlayerController player;
        public PlayerCameraController cam;
        public CharacterController characterController;
        public GameObject playerVisual;      // character model to hide while driving
        public Transform onFootCameraTarget;  // the normal follow target
        public float enterRange = 4.5f;

        InputAction _interact;
        IDrivable _current;

        void Awake()
        {
            if (player == null) player = GetComponent<PlayerController>();
            if (characterController == null) characterController = GetComponent<CharacterController>();
            _interact = new InputAction("Interact", InputActionType.Button, "<Keyboard>/f");
            _interact.AddBinding("<Gamepad>/buttonWest");
        }

        void OnEnable() => _interact.Enable();
        void OnDisable() => _interact.Disable();

        void Update()
        {
            if (!_interact.WasPressedThisFrame()) return;
            if (_current == null) TryEnter(); else Exit();
        }

        void TryEnter()
        {
            IDrivable best = null;
            float bestSq = enterRange * enterRange;
            Vector3 me = transform.position;
            // Any registered drivable (car / boat / aircraft), measured to the nearest point on its body.
            var all = Drivables.All;
            for (int i = 0; i < all.Count; i++)
            {
                var d = all[i];
                if (d == null || d.Transform == null) continue;
                var col = d.BodyCollider;
                Vector3 cp = col != null ? col.ClosestPoint(me) : d.Transform.position;
                float sq = (cp - me).sqrMagnitude;
                if (sq < bestSq) { bestSq = sq; best = d; }
            }
            // Also consider carjacking a nearby occupied traffic car (whichever is closest wins).
            TrafficCar bestCar = null;
            float carSq = enterRange * enterRange;
            var cars = TrafficCar.Active;
            for (int i = 0; i < cars.Count; i++)
            {
                var tc = cars[i];
                if (tc == null || !tc.Carjackable) continue;
                var col = tc.GetComponent<Collider>();
                Vector3 cp = col != null ? col.ClosestPoint(me) : tc.transform.position;
                float sq = (cp - me).sqrMagnitude;
                if (sq < carSq) { carSq = sq; bestCar = tc; }
            }

            if (bestCar != null && (best == null || carSq <= bestSq))
            {
                var jacked = bestCar.Carjack();
                ThreatBus.Crime(transform.position, 2.0f); // carjacking in view is a crime
                if (jacked != null) Enter(jacked);
                return;
            }

            if (best == null) return;
            Enter(best);
        }

        void Enter(IDrivable d)
        {
            _current = d;
            player.movementEnabled = false;
            if (characterController != null) characterController.enabled = false;
            if (playerVisual != null) playerVisual.SetActive(false);
            d.ControlEnabled = true;
            if (cam != null) cam.SetTarget(d.Transform, d.Transform, true, d.TrailHeading);
        }

        void Exit()
        {
            if (_current == null) return;
            _current.ControlEnabled = false;

            Transform t = _current.Transform;
            Vector3 exit = t.position + t.right * -_current.ExitOffset + Vector3.up * 1.2f;
            if (Physics.Raycast(exit + Vector3.up * 3f, Vector3.down, out var hit, 12f))
                exit.y = hit.point.y + 1.1f;
            transform.position = exit;

            if (characterController != null) characterController.enabled = true;
            if (playerVisual != null) playerVisual.SetActive(true);
            player.movementEnabled = true;
            if (cam != null) cam.SetTarget(onFootCameraTarget, onFootCameraTarget, false, false);
            _current = null;
        }

        public bool IsDriving => _current != null;
        /// <summary>The current vehicle if it's a car (null for boats/aircraft) — kept for callers
        /// like WorldBounds / respray that operate on the raycast car specifically.</summary>
        public ArcadeCarController CurrentCar => _current as ArcadeCarController;
        /// <summary>The thing the world/camera should track right now (vehicle if driving, else player).</summary>
        public Transform ActiveAvatar => _current != null ? _current.Transform : transform;
    }
}
