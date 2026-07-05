using UnityEngine;
using UnityEngine.InputSystem;
using SUNBREAK.World;

namespace SUNBREAK.Vehicles
{
    /// <summary>
    /// Arcade watercraft — a faithful port of the web build's <c>boat.ts</c>. A Rigidbody hull floats
    /// on a flat water plane (<see cref="Geography.WATER_LEVEL"/>) via spring-damper buoyancy (there
    /// is no water collider — buoyancy is pure force, engaging when the hull dips below the surface,
    /// which naturally confines floating to water). A nose-aligned propeller drives it, a speed-scaled
    /// rudder steers + banks, and a keel kills sideways slip. Self-rights so wakes can't capsize it.
    /// W/S = throttle/reverse, A/D = steer. PhysX only; numbers from presets.ts <c>BOAT_CFG</c>.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public sealed class BoatController : MonoBehaviour, IDrivable
    {
        [Header("Boat feel (ported from presets.ts BOAT_CFG)")]
        public float waterLevel = Geography.WATER_LEVEL;
        public float thrust = 16000f, reverseThrust = 8000f;
        public float buoyancy = 2.5f, draft = 0.7f, heaveDamp = 2.6f;
        public float steerTorque = 9000f, turnBank = 0.16f;
        public float lateralDrag = 3.2f, forwardDrag = 0.4f;
        public float levelAssist = 3.2f, angularDrag = 0f;

        public bool controlEnabled = false;

        const float G = 9.81f;

        Rigidbody _rb;
        Collider _col;
        InputAction _throttle, _steer, _reset;
        float _throttleIn, _steerIn;

        // ── IDrivable ───────────────────────────────────────────────────────────
        public Transform Transform => transform;
        public bool ControlEnabled { get => controlEnabled; set => controlEnabled = value; }
        public Collider BodyCollider => _col != null ? _col : (_col = GetComponent<Collider>());
        public float ExitOffset => 3.0f;
        public bool TrailHeading => true;
        public string VehicleName => "Boat";

        public float SpeedKmh => Vector3.Dot(transform.forward, _rb ? _rb.linearVelocity : Vector3.zero) * 3.6f;

        void Awake()
        {
            _rb = GetComponent<Rigidbody>();
            _rb.mass = 1200f;
            _rb.useGravity = true;
            _rb.linearDamping = 0f;      // horizontal drag handled here; buoyancy handles vertical
            _rb.angularDamping = 2.2f;
            _rb.centerOfMass = new Vector3(0f, -0.45f, 0f);
            _rb.interpolation = RigidbodyInterpolation.Interpolate;
            _rb.collisionDetectionMode = CollisionDetectionMode.Continuous;

            _throttle = new InputAction("BoatThrottle", InputActionType.Value);
            _throttle.AddCompositeBinding("1DAxis").With("Negative", "<Keyboard>/s").With("Positive", "<Keyboard>/w");
            _throttle.AddCompositeBinding("1DAxis").With("Negative", "<Keyboard>/downArrow").With("Positive", "<Keyboard>/upArrow");
            _throttle.AddBinding("<Gamepad>/rightTrigger");
            _steer = new InputAction("BoatSteer", InputActionType.Value);
            _steer.AddCompositeBinding("1DAxis").With("Negative", "<Keyboard>/a").With("Positive", "<Keyboard>/d");
            _steer.AddCompositeBinding("1DAxis").With("Negative", "<Keyboard>/leftArrow").With("Positive", "<Keyboard>/rightArrow");
            _steer.AddBinding("<Gamepad>/leftStick/x");
            _reset = new InputAction("BoatReset", InputActionType.Button, "<Keyboard>/r");
        }

        void OnEnable() { _throttle.Enable(); _steer.Enable(); _reset.Enable(); Drivables.Register(this); }
        void OnDisable() { _throttle.Disable(); _steer.Disable(); _reset.Disable(); Drivables.Unregister(this); }

        void Update()
        {
            float t = controlEnabled ? Mathf.Clamp(_throttle.ReadValue<float>(), -1f, 1f) : 0f;
            float s = controlEnabled ? Mathf.Clamp(_steer.ReadValue<float>(), -1f, 1f) : 0f;
            float k = 1f - Mathf.Exp(-10f * Time.deltaTime);
            _throttleIn = Mathf.Lerp(_throttleIn, t, k);
            _steerIn = Mathf.Lerp(_steerIn, s, k);
            if (controlEnabled && _reset.WasPressedThisFrame()) ResetUpright();
        }

        void FixedUpdate()
        {
            Vector3 up = transform.up, fwd = transform.forward, right = transform.right;
            Vector3 v = _rb.linearVelocity;
            float mass = _rb.mass;
            Vector3 pos = transform.position;

            float submersion = waterLevel - pos.y;      // >0 means the hull centre is underwater
            bool inWater = submersion > -draft * 0.5f;

            // ── Buoyancy (spring toward the surface) + heave damping ──
            if (submersion > 0f)
            {
                float upMul = Mathf.Clamp(submersion / draft, 0f, buoyancy);
                float fUp = upMul * mass * G - heaveDamp * mass * v.y;
                _rb.AddForce(new Vector3(0f, fUp, 0f), ForceMode.Force);
            }

            float fwdSpeed = Vector3.Dot(v, fwd);
            float sideSpeed = Vector3.Dot(v, right);

            if (inWater)
            {
                // Propeller thrust (throttle forward, reverse via negative throttle).
                float throttle = Mathf.Clamp01(_throttleIn);
                float brake = Mathf.Clamp01(-_throttleIn);
                float drive = throttle * thrust - brake * reverseThrust;
                if (drive != 0f)
                {
                    Vector3 f = fwd * drive; f.y = 0f; // planar so nose pitch doesn't dig/lift the hull
                    _rb.AddForce(f, ForceMode.Force);
                }

                // Rudder (yaw scales with speed, inverts in reverse) + bank into the turn.
                float steer = Mathf.Clamp(_steerIn, -1f, 1f);
                if (steer != 0f)
                {
                    float bite = Mathf.Clamp01(Mathf.Abs(fwdSpeed) / 6f);
                    float dir = fwdSpeed >= 0f ? 1f : -1f;
                    Vector3 tq = up * (steer * steerTorque * bite * dir);
                    tq += fwd * (-steer * turnBank * Mathf.Abs(fwdSpeed) * mass);
                    _rb.AddTorque(tq, ForceMode.Force);
                }

                // Hydrodynamic drag: gentle along the hull, strong across it (the keel).
                _rb.AddForce(fwd * (-fwdSpeed * forwardDrag * mass), ForceMode.Force);
                _rb.AddForce(right * (-sideSpeed * lateralDrag * mass), ForceMode.Force);
            }

            // Self-right toward upright.
            float align = Vector3.Dot(up, Vector3.up);
            if (align < 0.999f)
                _rb.AddTorque(Vector3.Cross(up, Vector3.up) * (levelAssist * mass), ForceMode.Force);
            if (angularDrag > 0f)
                _rb.AddTorque(_rb.angularVelocity * (-angularDrag * mass), ForceMode.Force);
        }

        public void ResetUpright()
        {
            transform.rotation = Quaternion.Euler(0f, transform.eulerAngles.y, 0f);
            _rb.angularVelocity = Vector3.zero;
        }
    }
}
