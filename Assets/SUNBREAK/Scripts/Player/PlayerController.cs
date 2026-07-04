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
        public float walkSpeed = 4.5f;
        public float sprintSpeed = 8.5f;
        public float jumpHeight = 1.4f;
        public float gravity = 22f;
        public float turnSharpness = 14f;

        [Header("Look")]
        [Tooltip("Degrees of yaw/pitch per pixel of mouse delta.")]
        public float mouseSensitivity = 0.12f;
        public float minPitch = -25f;
        public float maxPitch = 65f;
        public bool lockCursor = true;

        /// <summary>Camera yaw in degrees (world), driven by mouse X.</summary>
        public float LookYaw { get; private set; }
        /// <summary>Camera pitch in degrees, driven by mouse Y (clamped).</summary>
        public float LookPitch { get; private set; }

        CharacterController _cc;
        InputAction _move, _look, _jump, _sprint;
        Vector3 _velocity;

        void Awake()
        {
            _cc = GetComponent<CharacterController>();

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

            LookYaw = transform.eulerAngles.y;
        }

        void OnEnable()
        {
            _move.Enable();
            _look.Enable();
            _jump.Enable();
            _sprint.Enable();
        }

        void OnDisable()
        {
            _move.Disable();
            _look.Disable();
            _jump.Disable();
            _sprint.Disable();
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

            // ── Look (mouse delta is per-frame pixels → scale straight to degrees) ──
            Vector2 look = _look.ReadValue<Vector2>();
            LookYaw += look.x * mouseSensitivity;
            LookPitch = Mathf.Clamp(LookPitch - look.y * mouseSensitivity, minPitch, maxPitch);
            if (LookYaw > 180f) LookYaw -= 360f;
            else if (LookYaw < -180f) LookYaw += 360f;

            // ── Move (camera-relative on the XZ plane) ──
            Vector2 mv = _move.ReadValue<Vector2>();
            Vector3 wish = Quaternion.Euler(0f, LookYaw, 0f) * new Vector3(mv.x, 0f, mv.y);
            if (wish.sqrMagnitude > 1f) wish.Normalize();

            float speed = _sprint.IsPressed() ? sprintSpeed : walkSpeed;
            Vector3 horizontal = wish * speed;

            // ── Gravity + jump ──
            if (_cc.isGrounded)
            {
                if (_velocity.y < 0f) _velocity.y = -2f;
                if (_jump.WasPressedThisFrame())
                    _velocity.y = Mathf.Sqrt(2f * jumpHeight * gravity);
            }
            _velocity.y -= gravity * dt;

            _cc.Move((horizontal + Vector3.up * _velocity.y) * dt);

            // ── Face travel direction ──
            if (wish.sqrMagnitude > 0.01f)
            {
                Quaternion target = Quaternion.LookRotation(wish, Vector3.up);
                transform.rotation = Quaternion.Slerp(
                    transform.rotation, target, 1f - Mathf.Exp(-turnSharpness * dt));
            }
        }
    }
}
