using UnityEngine;
using UnityEngine.InputSystem;
using Unity.Cinemachine;
using SUNBREAK.Player;

namespace SUNBREAK.Cameras
{
    /// <summary>
    /// Drives the player camera rig: a Cinemachine third-person orbital (default), an
    /// aim/ADS mode (hold RMB → pulls in + narrows FOV + strafes the body), and a
    /// first-person toggle (V). Reads the accumulated look angles from
    /// <see cref="PlayerController"/> so input math lives in one place. Exposes
    /// <see cref="SetTarget"/> so a vehicle can borrow the same rig while driving.
    /// </summary>
    [DefaultExecutionOrder(-90)]
    public sealed class PlayerCameraController : MonoBehaviour
    {
        public PlayerController player;
        public CinemachineCamera thirdPersonCam;
        public CinemachineOrbitalFollow orbital;
        public CinemachineCamera firstPersonCam;
        public Transform headTarget;

        [Header("Framing")]
        public float tpRadius = 6.5f;
        public float aimRadius = 3.0f;
        public float tpFov = 52f;
        public float aimFov = 38f;
        public float fpFov = 62f;

        InputAction _aim, _toggleFp;
        bool _firstPerson;
        bool _vehicleMode;
        float _radius, _fov;

        public bool Aiming { get; private set; }
        public bool FirstPerson => _firstPerson;

        void Awake()
        {
            _aim = new InputAction("Aim", InputActionType.Button, "<Mouse>/rightButton");
            _aim.AddBinding("<Gamepad>/leftTrigger");
            _toggleFp = new InputAction("ToggleFP", InputActionType.Button, "<Keyboard>/v");
            _radius = tpRadius; _fov = tpFov;
        }

        void OnEnable() { _aim.Enable(); _toggleFp.Enable(); }
        void OnDisable() { _aim.Disable(); _toggleFp.Disable(); }

        void LateUpdate()
        {
            if (player == null) return;

            if (_toggleFp.WasPressedThisFrame() && !_vehicleMode) _firstPerson = !_firstPerson;
            Aiming = !_firstPerson && !_vehicleMode && _aim.IsPressed();

            bool fp = _firstPerson && !_vehicleMode;
            if (firstPersonCam != null) firstPersonCam.Priority = fp ? 20 : 0;
            if (thirdPersonCam != null) thirdPersonCam.Priority = fp ? 0 : 20;

            player.StrafeToLook = Aiming || fp;

            if (fp) DriveFirstPerson();
            else DriveThirdPerson();
        }

        void DriveThirdPerson()
        {
            if (orbital != null)
            {
                orbital.HorizontalAxis.Value = player.LookYaw;
                orbital.VerticalAxis.Value = player.LookPitch;
                float targetR = Aiming ? aimRadius : tpRadius;
                _radius = Mathf.Lerp(_radius, targetR, 1f - Mathf.Exp(-12f * Time.deltaTime));
                orbital.Radius = _radius;
            }
            if (thirdPersonCam != null)
            {
                float targetFov = _vehicleMode ? tpFov + 6f : (Aiming ? aimFov : tpFov);
                _fov = Mathf.Lerp(_fov, targetFov, 1f - Mathf.Exp(-12f * Time.deltaTime));
                var lens = thirdPersonCam.Lens; lens.FieldOfView = _fov; thirdPersonCam.Lens = lens;
            }
        }

        void DriveFirstPerson()
        {
            if (firstPersonCam == null || headTarget == null) return;
            Quaternion rot = Quaternion.Euler(player.LookPitch, player.LookYaw, 0f);
            firstPersonCam.transform.SetPositionAndRotation(
                headTarget.position + rot * new Vector3(0f, 0f, 0.05f), rot);
            var lens = firstPersonCam.Lens; lens.FieldOfView = fpFov; firstPersonCam.Lens = lens;
        }

        /// <summary>Set the base field-of-view from the settings menu; aim + first-person scale off it.</summary>
        public void ApplyFov(float baseFov)
        {
            tpFov = Mathf.Clamp(baseFov, 40f, 75f);
            aimFov = Mathf.Max(30f, tpFov - 14f);
            fpFov = tpFov + 10f;
        }

        /// <summary>Point the third-person rig at a new follow/look target (player or vehicle).</summary>
        public void SetTarget(Transform follow, Transform lookAt, bool vehicleMode)
        {
            _vehicleMode = vehicleMode;
            if (vehicleMode) _firstPerson = false;
            if (thirdPersonCam != null)
            {
                thirdPersonCam.Follow = follow;
                thirdPersonCam.LookAt = lookAt;
            }
        }
    }
}
