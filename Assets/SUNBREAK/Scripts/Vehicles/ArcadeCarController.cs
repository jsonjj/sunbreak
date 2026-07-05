using UnityEngine;
using UnityEngine.InputSystem;
using SUNBREAK.Combat;
using SUNBREAK.World;

namespace SUNBREAK.Vehicles
{
    /// <summary>
    /// Arcade raycast car. A Rigidbody chassis rides on N spring-damper "wheels" that
    /// cast rays to the ground; each grounded wheel applies a suspension force, a
    /// longitudinal drive/brake force, and a lateral grip force clamped to a friction
    /// circle (so it slides believably when overdriven). Layered arcade assists
    /// (down-force, an anti-roll bar, forgiving grip) keep it planted and fun. All feel
    /// lives in <see cref="VehicleConfig"/> (ported from the web presets.ts). PhysX only.
    ///
    /// Input is defined in code (new Input System) so it survives headless scene
    /// generation: WASD / arrows to drive, Space = handbrake. Camera-independent.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public sealed class ArcadeCarController : MonoBehaviour, IDrivable
    {
        // ── IDrivable ───────────────────────────────────────────────────────────
        public Transform Transform => transform;
        public bool ControlEnabled { get => controlEnabled; set => controlEnabled = value; }
        Collider _bodyCollider;
        public Collider BodyCollider => _bodyCollider != null ? _bodyCollider : (_bodyCollider = GetComponent<Collider>());
        public float ExitOffset => 2.4f;
        public bool TrailHeading => false; // cars keep the free-orbit camera
        public string VehicleName => "Car";

        [Tooltip("Handling profile (defaults to the ported Sedan). Set by the world generator.")]
        public VehicleConfig config = VehicleConfig.Sedan();

        [Tooltip("Visual wheel transforms in FL, FR, RL, RR order (optional; auto-spun/steered).")]
        public Transform[] wheelVisuals = new Transform[0];

        [Tooltip("What the wheel rays collide with (ground/buildings). Excludes the car itself.")]
        public LayerMask groundMask = ~0;

        [Tooltip("Master enable — drop to false to park the car (e.g. when not occupied).")]
        public bool controlEnabled = true;

        // Maps the abstract Rapier spring rate onto PhysX N/m. Tuned so the ported
        // stiffness values hold each preset at a natural ride height under gravity.
        const float SpringScale = 1000f;

        Rigidbody _rb;
        InputAction _throttle, _steer, _handbrake, _reset;

        float _steerDeg;                 // current shared front-wheel steer angle (deg)
        float _throttleIn, _steerIn;     // smoothed inputs [-1..1]
        bool _handbrakeIn;

        // Per-wheel runtime state (parallel to config.wheels)
        float[] _springLen;              // for visuals (smoothed)
        float[] _spinDeg;                // rolling angle for visuals
        float[] _comp01;                 // normalised compression this step (anti-roll bar)
        bool[] _grounded;

        /// <summary>Signed forward speed in km/h (for HUD / audio later).</summary>
        public float SpeedKmh => Vector3.Dot(transform.forward, _rb ? _rb.linearVelocity : Vector3.zero) * 3.6f;

        void Awake()
        {
            _rb = GetComponent<Rigidbody>();
            _rb.mass = config.mass;
            _rb.linearDamping = config.linearDamping;
            _rb.angularDamping = config.angularDamping;
            _rb.centerOfMass = config.centerOfMassOffset;
            _rb.interpolation = RigidbodyInterpolation.Interpolate;
            _rb.collisionDetectionMode = CollisionDetectionMode.Continuous;

            int n = config.wheels != null ? config.wheels.Length : 0;
            _springLen = new float[n];
            _spinDeg = new float[n];
            _comp01 = new float[n];
            _grounded = new bool[n];
            for (int i = 0; i < n; i++) _springLen[i] = config.wheels[i].suspensionRestLength;

            _throttle = new InputAction("Throttle", InputActionType.Value);
            _throttle.AddCompositeBinding("1DAxis")
                .With("Negative", "<Keyboard>/s").With("Positive", "<Keyboard>/w");
            _throttle.AddCompositeBinding("1DAxis")
                .With("Negative", "<Keyboard>/downArrow").With("Positive", "<Keyboard>/upArrow");
            _throttle.AddBinding("<Gamepad>/rightTrigger");

            _steer = new InputAction("Steer", InputActionType.Value);
            _steer.AddCompositeBinding("1DAxis")
                .With("Negative", "<Keyboard>/a").With("Positive", "<Keyboard>/d");
            _steer.AddCompositeBinding("1DAxis")
                .With("Negative", "<Keyboard>/leftArrow").With("Positive", "<Keyboard>/rightArrow");
            _steer.AddBinding("<Gamepad>/leftStick/x");

            _handbrake = new InputAction("Handbrake", InputActionType.Button);
            _handbrake.AddBinding("<Keyboard>/space");
            _handbrake.AddBinding("<Gamepad>/buttonSouth");

            _reset = new InputAction("ResetCar", InputActionType.Button);
            _reset.AddBinding("<Keyboard>/r");
        }

        void OnEnable() { _throttle.Enable(); _steer.Enable(); _handbrake.Enable(); _reset.Enable(); Drivables.Register(this); }
        void OnDisable() { _throttle.Disable(); _steer.Disable(); _handbrake.Disable(); _reset.Disable(); Drivables.Unregister(this); }

        void Update()
        {
            // Smooth inputs on the render clock; physics reads the smoothed values.
            float tTarget = controlEnabled ? Mathf.Clamp(_throttle.ReadValue<float>(), -1f, 1f) : 0f;
            float sTarget = controlEnabled ? Mathf.Clamp(_steer.ReadValue<float>(), -1f, 1f) : 0f;
            float k = 1f - Mathf.Exp(-12f * Time.deltaTime);
            _throttleIn = Mathf.Lerp(_throttleIn, tTarget, k);
            _steerIn = Mathf.Lerp(_steerIn, sTarget, k);
            _handbrakeIn = controlEnabled && _handbrake.IsPressed();

            if (controlEnabled && _reset.WasPressedThisFrame()) ResetUpright();

            UpdateWheelVisuals();
        }

        void FixedUpdate()
        {
            if (config.wheels == null || config.wheels.Length == 0) return;
            float dt = Time.fixedDeltaTime;

            float forwardSpeed = Vector3.Dot(transform.forward, _rb.linearVelocity);
            float topSpeed = Mathf.Max(1f, config.topSpeedKmh / 3.6f);

            UpdateSteering(forwardSpeed, topSpeed, dt);

            int driven = 0;
            for (int i = 0; i < config.wheels.Length; i++) if (config.wheels[i].driven) driven++;
            driven = Mathf.Max(1, driven);

            int groundedCount = 0;
            for (int i = 0; i < config.wheels.Length; i++)
            {
                if (SolveWheel(i, forwardSpeed, topSpeed, driven, dt)) groundedCount++;
            }

            ApplyAntiRollBar();
            ApplyAeroAndAssists(forwardSpeed, groundedCount, dt);

            // Driving fast (while occupied) scatters nearby pedestrians (reckless-driving fear).
            if (controlEnabled && Mathf.Abs(forwardSpeed) > 12f)
            {
                _threatPulseT -= dt;
                if (_threatPulseT <= 0f) { ThreatBus.VehicleThreat(transform.position + transform.forward * 5f); _threatPulseT = 0.4f; }
            }
        }

        float _threatPulseT;

        void OnCollisionEnter(Collision c)
        {
            if (!controlEnabled || _rb == null) return; // only the player's driven car runs people over
            float speed = _rb.linearVelocity.magnitude;
            if (speed < 5f) return;
            var d = c.collider.GetComponentInParent<IDamageable>();
            if (d == null || d.IsDead) return;
            if (d.Faction != Faction.Civilian && d.Faction != Faction.Police) return;
            Vector3 pt = c.contactCount > 0 ? c.GetContact(0).point : transform.position;
            d.ApplyDamage(new DamageInfo
            {
                amount = Mathf.Clamp(speed * 7f, 25f, 220f), point = pt,
                dir = _rb.linearVelocity.normalized, impulse = speed, fromPlayer = true, attacker = gameObject,
            });
            ThreatBus.Crime(transform.position, 3.0f); // vehicular assault — witnessed
        }

        void UpdateSteering(float forwardSpeed, float topSpeed, float dt)
        {
            float speed01 = Mathf.Clamp01(Mathf.Abs(forwardSpeed) / Mathf.Max(1f, config.steerSpeedRef));
            float steerScale = Mathf.Lerp(1f, config.steerAtMaxSpeed, speed01);
            float maxDeg = config.maxSteer * Mathf.Rad2Deg;
            // steerSign keeps the ported "+input curves right" convention consistent.
            float target = _steerIn * config.steerSign * -1f * maxDeg * steerScale;
            _steerDeg = Mathf.Lerp(_steerDeg, target, 1f - Mathf.Exp(-config.steerDampRate * dt));
        }

        /// <returns>true if the wheel is on the ground this step.</returns>
        bool SolveWheel(int i, float forwardSpeed, float topSpeed, int drivenCount, float dt)
        {
            WheelSpec w = config.wheels[i];
            Vector3 up = transform.up;
            Vector3 root = transform.TransformPoint(w.position);
            float rayLen = w.suspensionRestLength + w.radius;

            if (!Physics.Raycast(root, -up, out RaycastHit hit, rayLen, groundMask, QueryTriggerInteraction.Ignore)
                || hit.rigidbody == _rb)
            {
                _grounded[i] = false;
                _comp01[i] = 0f;
                _springLen[i] = Mathf.Lerp(_springLen[i], w.suspensionRestLength, 1f - Mathf.Exp(-10f * dt));
                // free wheel keeps spinning down
                _spinDeg[i] += (forwardSpeed / Mathf.Max(0.05f, w.radius)) * Mathf.Rad2Deg * dt;
                return false;
            }

            _grounded[i] = true;

            // ── Suspension (spring + damper) ──
            float springLen = Mathf.Clamp(hit.distance - w.radius,
                w.suspensionRestLength - w.maxSuspensionTravel,
                w.suspensionRestLength + w.maxSuspensionTravel);
            _springLen[i] = springLen;
            float offset = w.suspensionRestLength - springLen;      // + when compressed
            _comp01[i] = Mathf.Clamp01(offset / Mathf.Max(0.001f, w.maxSuspensionTravel));

            Vector3 pointVel = _rb.GetPointVelocity(root);
            float springVel = Vector3.Dot(up, pointVel);            // >0 extending, <0 compressing
            float cornerMass = _rb.mass * 0.25f;
            float k = w.suspensionStiffness * SpringScale;
            float critical = 2f * Mathf.Sqrt(Mathf.Max(1f, k * cornerMass));
            float dampRatio = springVel < 0f ? w.suspensionCompression : w.suspensionRelaxation;
            float springForce = Mathf.Clamp(offset * k - springVel * (dampRatio * critical),
                0f, w.maxSuspensionForce);
            _rb.AddForceAtPosition(up * springForce, root);

            // ── Tyre contact frame (projected onto the ground) ──
            Vector3 n = hit.normal;
            float steer = w.steered ? _steerDeg : 0f;
            Vector3 fwd = Quaternion.AngleAxis(steer, up) * transform.forward;
            fwd = Vector3.ProjectOnPlane(fwd, n).normalized;
            Vector3 right = Vector3.Cross(n, fwd).normalized;
            Vector3 contactVel = _rb.GetPointVelocity(hit.point);

            // Normal load available for the friction circle. Keep a floor on it so the car always has
            // grip to drive even when the springs are barely loaded (arcade forgiveness).
            float minLoad = cornerMass * 9.81f * 0.8f;
            float load = Mathf.Max(springForce, minLoad);
            float frictionCircle = w.frictionSlip * load * WeatherSystem.GripMultiplier; // wet roads = less grip

            // ── Lateral grip (cancel sideways slip up to the friction budget) ──
            float lateralVel = Vector3.Dot(right, contactVel);
            float grip = w.sideFrictionStiffness + config.arcade.gripAssist;
            if (Mathf.Abs(forwardSpeed) > config.arcade.gripFadeSpeed)
                grip *= Mathf.Lerp(1f, 0.85f, Mathf.Clamp01(
                    (Mathf.Abs(forwardSpeed) - config.arcade.gripFadeSpeed) / config.arcade.gripFadeSpeed));
            if (_handbrakeIn && w.handbrake) grip *= config.arcade.driftSideMul;
            grip = Mathf.Clamp(grip, 0f, 1.1f);

            float desiredLatForce = -lateralVel * grip * cornerMass / dt;
            desiredLatForce = Mathf.Clamp(desiredLatForce, -frictionCircle, frictionCircle);
            _rb.AddForceAtPosition(right * desiredLatForce, hit.point);

            // ── Longitudinal: drive / brake / reverse / rolling resistance ──
            float longForce = 0f;
            if (w.driven && Mathf.Abs(_throttleIn) > 0.01f)
            {
                if (_throttleIn > 0f)
                {
                    float fade = Mathf.Clamp01(1f - Mathf.Max(0f, forwardSpeed) / topSpeed);
                    longForce = _throttleIn * config.engineForce * fade / drivenCount;
                }
                else
                {
                    if (forwardSpeed > 0.5f)
                        longForce = _throttleIn * config.brakeForce / drivenCount;      // braking
                    else
                    {
                        float fade = Mathf.Clamp01(1f - Mathf.Abs(forwardSpeed) / (topSpeed * 0.4f));
                        longForce = _throttleIn * config.reverseForce * fade / drivenCount;
                    }
                }
            }

            // Handbrake locks the rear: strong brake + reduced long. grip.
            if (_handbrakeIn && w.handbrake)
            {
                longForce += -Mathf.Sign(forwardSpeed) * config.handbrakeForce * 0.5f;
                longForce *= config.arcade.driftFrictionMul;
            }
            else if (Mathf.Abs(_throttleIn) < 0.01f)
            {
                // engine braking / rolling resistance so it coasts to a stop
                longForce += -Mathf.Sign(forwardSpeed) *
                             Mathf.Min(Mathf.Abs(forwardSpeed) * cornerMass * 0.6f, cornerMass * 2f);
            }

            longForce = Mathf.Clamp(longForce, -frictionCircle, frictionCircle);
            _rb.AddForceAtPosition(fwd * longForce, hit.point);

            // Visual spin from ground speed along the wheel's forward.
            float rollSpeed = Vector3.Dot(fwd, contactVel);
            _spinDeg[i] += (rollSpeed / Mathf.Max(0.05f, w.radius)) * Mathf.Rad2Deg * dt;
            return true;
        }

        /// <summary>Classic anti-roll bar: resist compression difference across each axle.</summary>
        void ApplyAntiRollBar()
        {
            if (config.wheels.Length < 4) return;
            float arb = config.arcade.antiRoll * 400f;
            ApplyAxleRoll(0, 1, arb); // front FL/FR
            ApplyAxleRoll(2, 3, arb); // rear RL/RR
        }

        void ApplyAxleRoll(int l, int r, float arb)
        {
            if (!_grounded[l] && !_grounded[r]) return;
            float diff = _comp01[l] - _comp01[r];
            Vector3 up = transform.up;
            if (_grounded[l]) _rb.AddForceAtPosition(-up * diff * arb, transform.TransformPoint(config.wheels[l].position));
            if (_grounded[r]) _rb.AddForceAtPosition(up * diff * arb, transform.TransformPoint(config.wheels[r].position));
        }

        void ApplyAeroAndAssists(float forwardSpeed, int groundedCount, float dt)
        {
            if (groundedCount == 0) return;
            // Speed-scaled down-force pins the car for confident high-speed grip.
            float df = config.arcade.downforce * Mathf.Abs(forwardSpeed) * config.mass * 0.02f;
            _rb.AddForce(-transform.up * df);
        }

        void UpdateWheelVisuals()
        {
            if (wheelVisuals == null) return;
            int n = Mathf.Min(wheelVisuals.Length, config.wheels.Length);
            for (int i = 0; i < n; i++)
            {
                Transform vis = wheelVisuals[i];
                if (vis == null) continue;
                WheelSpec w = config.wheels[i];
                Vector3 local = w.position + Vector3.down * _springLen[i];
                vis.localPosition = local;
                float steer = w.steered ? _steerDeg : 0f;
                vis.localRotation = Quaternion.Euler(_spinDeg[i], steer, 0f);
            }
        }

        /// <summary>Flip the car back onto its wheels in place (R key) if it's stuck.</summary>
        public void ResetUpright()
        {
            Vector3 pos = transform.position + Vector3.up * 1.2f;
            transform.SetPositionAndRotation(pos, Quaternion.Euler(0f, transform.eulerAngles.y, 0f));
            _rb.linearVelocity = Vector3.zero;
            _rb.angularVelocity = Vector3.zero;
        }

        void OnDrawGizmosSelected()
        {
            if (config?.wheels == null) return;
            Gizmos.color = Color.yellow;
            foreach (var w in config.wheels)
            {
                Vector3 root = transform.TransformPoint(w.position);
                Gizmos.DrawWireSphere(root - transform.up * w.suspensionRestLength, w.radius);
                Gizmos.DrawLine(root, root - transform.up * (w.suspensionRestLength + w.radius));
            }
        }
    }
}
