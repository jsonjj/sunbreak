using UnityEngine;
using UnityEngine.InputSystem;
using SUNBREAK.World;

namespace SUNBREAK.Vehicles
{
    /// <summary>
    /// Arcade flight model for helicopters + fixed-wing planes — a port of the web build's
    /// <c>flight.ts</c>. Body frame: nose = +Z, up = +Y, right = +X.
    ///  • Helicopter: collective (Shift/Ctrl) → thrust along body-up; tilt the body to move.
    ///  • Plane: throttle (Shift/Ctrl) → thrust along the nose; wing lift ∝ forward airspeed² so it
    ///    must build speed to take off and stalls/sinks when too slow.
    /// Controls: W/S cyclic-or-elevator (pitch), A/D bank (roll), Q/E yaw, Shift/Ctrl power.
    /// Fades thrust/lift + eases down above <see cref="Geography.FLIGHT_CEILING"/>. Numbers from
    /// presets.ts HELI_FLIGHT / PLANE_FLIGHT.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public sealed class AircraftController : MonoBehaviour, IDrivable
    {
        [Header("Class")]
        public bool fixedWing = false; // false = helicopter, true = plane

        [Header("Flight feel (ported from presets.ts)")]
        public float maxThrust = 48000f;
        public float hoverCollective = 0.45f;
        public float liftCoeff = 0f, liftSpeedCap = 0f;
        public float pitchTorque = 12000f, rollTorque = 7000f, yawTorque = 9000f;
        public float controlRefSpeed = 1f;
        public float levelAssist = 2.4f, headingAssist = 0.6f;
        public float linearDrag = 0f, angularDrag = 0f;
        public float rotorSpinRate = 42f;

        [Header("Visuals (set by the spawner)")]
        public Transform mainRotor;   // spins about local Y (heli) — or the nose prop (plane, about Z)
        public Transform tailRotor;   // spins about local X

        public bool controlEnabled = false;

        const float CeilingFadeM = 32f;

        Rigidbody _rb;
        Collider _col;
        InputAction _pitch, _roll, _yaw, _up, _down;
        float _pitchIn, _rollIn, _yawIn, _power;

        // ── IDrivable ───────────────────────────────────────────────────────────
        public Transform Transform => transform;
        public bool ControlEnabled { get => controlEnabled; set => controlEnabled = value; }
        public Collider BodyCollider => _col != null ? _col : (_col = GetComponent<Collider>());
        public float ExitOffset => 3.4f;
        public bool TrailHeading => true;
        public string VehicleName => fixedWing ? "Plane" : "Helicopter";

        void Awake()
        {
            _rb = GetComponent<Rigidbody>();
            _rb.useGravity = true;
            _rb.interpolation = RigidbodyInterpolation.Interpolate;
            _rb.collisionDetectionMode = CollisionDetectionMode.Continuous;
            _power = fixedWing ? 0.4f : hoverCollective;

            _pitch = Axis("Pitch", "<Keyboard>/s", "<Keyboard>/w");           // W = nose down
            _roll = Axis("Roll", "<Keyboard>/a", "<Keyboard>/d");             // D = bank right
            _yaw = Axis("Yaw", "<Keyboard>/q", "<Keyboard>/e");              // E = nose right
            _up = new InputAction("Climb", InputActionType.Button, "<Keyboard>/leftShift");
            _up.AddBinding("<Keyboard>/rightShift");
            _down = new InputAction("Descend", InputActionType.Button, "<Keyboard>/leftCtrl");
            _down.AddBinding("<Keyboard>/rightCtrl");
        }

        static InputAction Axis(string name, string neg, string pos)
        {
            var a = new InputAction(name, InputActionType.Value);
            a.AddCompositeBinding("1DAxis").With("Negative", neg).With("Positive", pos);
            return a;
        }

        void OnEnable()
        {
            _pitch.Enable(); _roll.Enable(); _yaw.Enable(); _up.Enable(); _down.Enable();
            Drivables.Register(this);
        }
        void OnDisable()
        {
            _pitch.Disable(); _roll.Disable(); _yaw.Disable(); _up.Disable(); _down.Disable();
            Drivables.Unregister(this);
        }

        void Update()
        {
            float dt = Time.deltaTime;
            float k = 1f - Mathf.Exp(-10f * dt);
            _pitchIn = Mathf.Lerp(_pitchIn, controlEnabled ? -_pitch.ReadValue<float>() : 0f, k); // W→nose down
            _rollIn = Mathf.Lerp(_rollIn, controlEnabled ? _roll.ReadValue<float>() : 0f, k);
            _yawIn = Mathf.Lerp(_yawIn, controlEnabled ? _yaw.ReadValue<float>() : 0f, k);

            if (controlEnabled)
            {
                if (_up.IsPressed()) _power += 0.6f * dt;
                if (_down.IsPressed()) _power -= 0.6f * dt;
                _power = Mathf.Clamp01(_power);
            }

            SpinRotors(dt);
        }

        void SpinRotors(float dt)
        {
            float rate = rotorSpinRate * (0.3f + 0.7f * _power) * (controlEnabled ? 1f : 0.15f);
            if (mainRotor != null)
                mainRotor.Rotate(fixedWing ? new Vector3(0f, 0f, rate * 60f * dt) : new Vector3(0f, rate * 60f * dt, 0f), Space.Self);
            if (tailRotor != null) tailRotor.Rotate(rate * 60f * dt, 0f, 0f, Space.Self);
        }

        void FixedUpdate()
        {
            // Parked: no thrust/lift/control — just rest on the collider under gravity. (Otherwise the
            // persistent collective/throttle would fly it off its spawn while unoccupied.)
            if (!controlEnabled) return;

            Vector3 up = transform.up, fwd = transform.forward, right = transform.right;
            Vector3 v = _rb.linearVelocity;
            float speed = v.magnitude;
            float fwdSpeed = Vector3.Dot(v, fwd);
            float mass = _rb.mass;

            float pitch = Mathf.Clamp(_pitchIn, -1f, 1f);
            float roll = Mathf.Clamp(_rollIn, -1f, 1f);
            float yaw = Mathf.Clamp(_yawIn, -1f, 1f);

            // Soft flight ceiling: fade thrust/lift + ease down before the hard ceiling.
            float overCeiling = transform.position.y - Geography.FLIGHT_CEILING;
            float ceilFactor = overCeiling <= 0f ? 1f : Mathf.Clamp01(1f - overCeiling / CeilingFadeM);
            if (overCeiling > 0f)
                _rb.AddForce(new Vector3(0f, -Mathf.Min(overCeiling, CeilingFadeM) * 0.6f * mass, 0f), ForceMode.Force);

            // Primary thrust + lift.
            if (fixedWing)
            {
                float throttle = Mathf.Clamp01(_power) * ceilFactor;
                if (throttle > 0f) _rb.AddForce(fwd * (throttle * maxThrust), ForceMode.Force);
                float va = Mathf.Clamp(fwdSpeed, 0f, liftSpeedCap);
                float lift = liftCoeff * va * va;
                if (lift > 0f) _rb.AddForce(up * lift, ForceMode.Force);
            }
            else
            {
                float collective = Mathf.Clamp01(_power) * ceilFactor;
                float thrust = collective * maxThrust;
                if (thrust > 0f) _rb.AddForce(up * thrust, ForceMode.Force);
            }

            // Control torques (planes lose authority at low airspeed; helis keep full authority).
            float auth = fixedWing ? Mathf.Clamp01(0.12f + speed / Mathf.Max(1f, controlRefSpeed)) : 1f;
            Vector3 tq = Vector3.zero;
            tq += right * (-pitch * pitchTorque * auth); // +pitch = nose up
            tq += fwd * (-roll * rollTorque * auth);     // +roll = bank right
            tq += up * (yaw * yawTorque * auth);         // +yaw = nose right
            if (fixedWing) tq += up * (-right.y * yawTorque * 0.35f * auth); // coordinated turn
            _rb.AddTorque(tq, ForceMode.Force);

            // Auto-level toward world-up, faded out while actively maneuvering.
            float activeCmd = Mathf.Min(1f, Mathf.Abs(pitch) + Mathf.Abs(roll));
            float levelGain = levelAssist * (1f - activeCmd);
            if (levelGain > 0f)
            {
                float align = Vector3.Dot(up, Vector3.up);
                if (align < 0.999f)
                    _rb.AddTorque(Vector3.Cross(up, Vector3.up) * (levelGain * mass), ForceMode.Force);
            }

            // Heading assist / weather-vane: cancel sideways drift.
            if (headingAssist > 0f && speed > 0.5f)
            {
                float side = Vector3.Dot(v, right);
                if (Mathf.Abs(side) > 1e-3f)
                    _rb.AddForce(right * (-side * headingAssist * mass), ForceMode.Force);
            }

            if (linearDrag > 0f && speed > 0.01f) _rb.AddForce(v * (-linearDrag * mass), ForceMode.Force);
            if (angularDrag > 0f) _rb.AddTorque(_rb.angularVelocity * (-angularDrag * mass), ForceMode.Force);
        }

        /// <summary>Configure as a helicopter (presets.ts HELI_FLIGHT).</summary>
        public void MakeHelicopter()
        {
            fixedWing = false;
            maxThrust = 48000f; hoverCollective = 0.45f; liftCoeff = 0f; liftSpeedCap = 0f;
            pitchTorque = 12000f; rollTorque = 7000f; yawTorque = 9000f; controlRefSpeed = 1f;
            levelAssist = 2.4f; headingAssist = 0.6f; linearDrag = 0f; angularDrag = 0f; rotorSpinRate = 42f;
            _rb = GetComponent<Rigidbody>();
            _rb.mass = 2200f; _rb.linearDamping = 0.12f; _rb.angularDamping = 3.0f;
            _rb.centerOfMass = new Vector3(0f, -0.55f, 0f);
            _power = hoverCollective;
        }

        /// <summary>Configure as a fixed-wing plane (presets.ts PLANE_FLIGHT).</summary>
        public void MakePlane()
        {
            fixedWing = true;
            maxThrust = 9000f; hoverCollective = 0f; liftCoeff = 15f; liftSpeedCap = 62f;
            pitchTorque = 12000f; rollTorque = 4000f; yawTorque = 6000f; controlRefSpeed = 45f;
            levelAssist = 0.8f; headingAssist = 1.3f; linearDrag = 0f; angularDrag = 0f; rotorSpinRate = 130f;
            _rb = GetComponent<Rigidbody>();
            _rb.mass = 1400f; _rb.linearDamping = 0.07f; _rb.angularDamping = 1.2f;
            _rb.centerOfMass = new Vector3(0f, -0.2f, 0f);
            _power = 0.4f;
        }
    }
}
