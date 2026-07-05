using UnityEngine;
using UnityEngine.InputSystem;

namespace SUNBREAK.Player
{
    /// <summary>
    /// Minimal Slice 0 third-person player controller. Kinematic capsule driven by a
    /// <see cref="CharacterController"/> with walk/sprint, gravity and jump. Uses the new
    /// Input System with actions defined entirely in code (no asset wiring, so it is robust
    /// to headless scene generation). Mouse look accumulates yaw/pitch which the camera rig
    /// (<c>ThirdPersonCameraRig</c>) reads to drive the Cinemachine orbital follow.
    /// Movement is camera-relative and the body turns toward its travel direction.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public sealed class PlayerController : MonoBehaviour
    {
        [Header("Movement (m/s)")]
        public float walkSpeed = 4.6f;
        public float sprintSpeed = 8.5f;
        public float crouchSpeed = 2.2f;
        public float jumpHeight = 1.4f;
        public float gravity = 22f;
        public float turnSharpness = 14f;

        [Header("Crouch")]
        public float standHeight = 2f;
        public float crouchHeight = 1.2f;

        [Header("Look")]
        [Tooltip("Degrees of yaw/pitch per pixel of mouse delta.")]
        public float mouseSensitivity = 0.12f;
        public bool invertY = false;
        public float minPitch = -35f;
        public float maxPitch = 70f;
        public bool lockCursor = true;

        /// <summary>Camera yaw in degrees (world), driven by mouse X.</summary>
        public float LookYaw { get; private set; }
        /// <summary>Camera pitch in degrees, driven by mouse Y (clamped).</summary>
        public float LookPitch { get; private set; }
        /// <summary>Horizontal speed this frame (m/s) — drives the locomotion blend tree.</summary>
        public float PlanarSpeed { get; private set; }
        public bool IsSprinting { get; private set; }
        public bool IsCrouching { get; private set; }
        public bool IsGrounded => _cc != null && _cc.isGrounded;
        /// <summary>When aiming, the body faces LookYaw instead of the travel direction (strafe).</summary>
        public bool StrafeToLook { get; set; }
        /// <summary>Lock body movement (e.g. while driving) but keep look active for the camera.</summary>
        public bool movementEnabled = true;

        CharacterController _cc;
        InputAction _move, _look, _jump, _sprint, _crouch;
        Vector3 _velocity;
        float _height;

        void Awake()
        {
            _cc = GetComponent<CharacterController>();
            _height = standHeight;

            _move = new InputAction("Move", InputActionType.Value);
            _move.AddCompositeBinding("2DVector")
                .With("Up", "<Keyboard>/w").With("Down", "<Keyboard>/s")
                .With("Left", "<Keyboard>/a").With("Right", "<Keyboard>/d");
            _move.AddCompositeBinding("2DVector")
                .With("Up", "<Keyboard>/upArrow").With("Down", "<Keyboard>/downArrow")
                .With("Left", "<Keyboard>/leftArrow").With("Right", "<Keyboard>/rightArrow");
            _move.AddBinding("<Gamepad>/leftStick");

            _look = new InputAction("Look", InputActionType.Value);
            _look.AddBinding("<Mouse>/delta");
            _look.AddBinding("<Gamepad>/rightStick");

            _jump = new InputAction("Jump", InputActionType.Button);
            _jump.AddBinding("<Keyboard>/space");
            _jump.AddBinding("<Gamepad>/buttonSouth");

            _sprint = new InputAction("Sprint", InputActionType.Button);
            _sprint.AddBinding("<Keyboard>/leftShift");
            _sprint.AddBinding("<Gamepad>/leftStickPress");

            _crouch = new InputAction("Crouch", InputActionType.Button);
            _crouch.AddBinding("<Keyboard>/c");
            _crouch.AddBinding("<Keyboard>/leftCtrl");
            _crouch.AddBinding("<Gamepad>/buttonEast");

            LookYaw = transform.eulerAngles.y;
        }

        /// <summary>Weapon recoil kick into the shared look angles (dPitch &lt; 0 raises the aim).</summary>
        public void AddLook(float dPitch, float dYaw)
        {
            LookPitch = Mathf.Clamp(LookPitch + dPitch, minPitch, maxPitch);
            LookYaw += dYaw;
        }

        /// <summary>Ease the camera yaw toward a heading (chase cam trailing a boat/aircraft). Mouse
        /// look still nudges it; this recenters behind the craft.</summary>
        public void TrailYaw(float targetYaw, float t)
        {
            LookYaw = Mathf.LerpAngle(LookYaw, targetYaw, Mathf.Clamp01(t));
            if (LookYaw > 180f) LookYaw -= 360f; else if (LookYaw < -180f) LookYaw += 360f;
        }

        /// <summary>Place the player at a world position + heading (save/load, respawn). Toggles the
        /// CharacterController so the move happens even while it's active.</summary>
        public void Teleport(Vector3 pos, float yaw)
        {
            bool was = _cc != null && _cc.enabled;
            if (_cc != null) _cc.enabled = false;
            transform.position = pos;
            LookYaw = yaw;
            _velocity = Vector3.zero;
            if (_cc != null) _cc.enabled = was;
        }

        void OnEnable()
        {
            _move.Enable(); _look.Enable(); _jump.Enable(); _sprint.Enable(); _crouch.Enable();
        }

        void OnDisable()
        {
            _move.Disable(); _look.Disable(); _jump.Disable(); _sprint.Disable(); _crouch.Disable();
            PlanarSpeed = 0f;
        }

        void Start()
        {
            if (lockCursor)
            {
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
        }

        void Update()
        {
            float dt = Time.deltaTime;

            // Fully frozen by a full-screen overlay (map / pause / shop) — don't move OR look, so
            // WASD/mouse drive the overlay instead of the player behind it.
            if (Time.timeScale == 0f) { PlanarSpeed = 0f; return; }

            // ── Look (mouse delta is per-frame pixels → scale straight to degrees) ──
            Vector2 look = _look.ReadValue<Vector2>();
            LookYaw += look.x * mouseSensitivity;
            float pitchDelta = look.y * mouseSensitivity * (invertY ? 1f : -1f);
            LookPitch = Mathf.Clamp(LookPitch + pitchDelta, minPitch, maxPitch);
            if (LookYaw > 180f) LookYaw -= 360f;
            else if (LookYaw < -180f) LookYaw += 360f;

            if (!movementEnabled || !_cc.enabled) { PlanarSpeed = 0f; IsSprinting = false; return; }

            // ── Crouch (toggle capsule height) ──
            IsCrouching = _crouch.IsPressed();
            float targetH = IsCrouching ? crouchHeight : standHeight;
            _height = Mathf.Lerp(_height, targetH, 1f - Mathf.Exp(-12f * dt));
            _cc.height = _height;
            _cc.center = new Vector3(0f, (_height - standHeight) * 0.5f, 0f);

            // ── Move (camera-relative on the XZ plane) ──
            Vector2 mv = _move.ReadValue<Vector2>();
            Vector3 wish = Quaternion.Euler(0f, LookYaw, 0f) * new Vector3(mv.x, 0f, mv.y);
            if (wish.sqrMagnitude > 1f) wish.Normalize();

            IsSprinting = _sprint.IsPressed() && !IsCrouching && mv.y > 0.1f;
            float speed = IsCrouching ? crouchSpeed : (IsSprinting ? sprintSpeed : walkSpeed);
            Vector3 horizontal = wish * speed;
            PlanarSpeed = new Vector2(horizontal.x, horizontal.z).magnitude;

            // ── Gravity + jump ──
            if (_cc.isGrounded)
            {
                if (_velocity.y < 0f) _velocity.y = -2f;
                if (_jump.WasPressedThisFrame() && !IsCrouching)
                    _velocity.y = Mathf.Sqrt(2f * jumpHeight * gravity);
            }
            _velocity.y -= gravity * dt;

            _cc.Move((horizontal + Vector3.up * _velocity.y) * dt);

            // ── Face travel direction (or look direction when aiming) ──
            Vector3 face = StrafeToLook ? (Quaternion.Euler(0f, LookYaw, 0f) * Vector3.forward) : wish;
            if (face.sqrMagnitude > 0.01f)
            {
                Quaternion target = Quaternion.LookRotation(face, Vector3.up);
                transform.rotation = Quaternion.Slerp(
                    transform.rotation, target, 1f - Mathf.Exp(-turnSharpness * dt));
            }
        }
    }
}
