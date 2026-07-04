using UnityEngine;
using UnityEngine.InputSystem;
using SUNBREAK.Cameras;
using SUNBREAK.Player;

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
        public float enterRange = 4.0f;

        InputAction _interact;
        ArcadeCarController _current;

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
            ArcadeCarController best = null;
            float bestSq = enterRange * enterRange;
            foreach (var car in FindObjectsByType<ArcadeCarController>(FindObjectsSortMode.None))
            {
                float sq = (car.transform.position - transform.position).sqrMagnitude;
                if (sq < bestSq) { bestSq = sq; best = car; }
            }
            if (best == null) return;

            _current = best;
            player.movementEnabled = false;
            if (characterController != null) characterController.enabled = false;
            if (playerVisual != null) playerVisual.SetActive(false);
            best.controlEnabled = true;
            if (cam != null) cam.SetTarget(best.transform, best.transform, true);
        }

        void Exit()
        {
            if (_current == null) return;
            _current.controlEnabled = false;

            Vector3 side = _current.transform.right * -2.4f;
            Vector3 exit = _current.transform.position + side + Vector3.up * 1.2f;
            if (Physics.Raycast(exit + Vector3.up * 2f, Vector3.down, out var hit, 8f))
                exit.y = hit.point.y + 1.1f;
            transform.position = exit;

            if (characterController != null) characterController.enabled = true;
            if (playerVisual != null) playerVisual.SetActive(true);
            player.movementEnabled = true;
            if (cam != null) cam.SetTarget(onFootCameraTarget, onFootCameraTarget, false);
            _current = null;
        }

        public bool IsDriving => _current != null;
        public ArcadeCarController CurrentCar => _current;
        /// <summary>The thing the world/camera should track right now (car if driving, else player).</summary>
        public Transform ActiveAvatar => _current != null ? _current.transform : transform;
    }
}
