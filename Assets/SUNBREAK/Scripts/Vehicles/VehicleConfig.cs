using System;
using UnityEngine;

namespace SUNBREAK.Vehicles
{
    // ─────────────────────────────────────────────────────────────────────────
    // Data-driven vehicle handling — a C# port of the web prototype's
    // physics/vehicle/presets.ts. The web build ran a Rapier raycast vehicle; here
    // the same tuned numbers feed a hand-rolled PhysX raycast solver
    // (ArcadeCarController). Numbers are ported verbatim where they transfer 1:1
    // (mass, dimensions, forces, steer, top speed, wheel layout, friction ratios);
    // the suspension constants are re-interpreted for the PhysX model in the solver.
    //
    // Convention preserved from the web: the chassis drives nose-forward along +Z
    // (matches Unity's forward), +X right, +Y up. All distances in metres.
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>One raycast "wheel": a spring + a tyre contact patch. Chassis-local.</summary>
    [Serializable]
    public struct WheelSpec
    {
        /// <summary>Spring connection point (chassis-local): top of the suspension.</summary>
        public Vector3 position;
        public float radius;
        public float suspensionRestLength;
        /// <summary>Spring rate (web/Rapier units); scaled to N/m in the solver.</summary>
        public float suspensionStiffness;
        /// <summary>Damping ratio while compressing (0..1 of critical).</summary>
        public float suspensionCompression;
        /// <summary>Damping ratio while extending (0..1 of critical).</summary>
        public float suspensionRelaxation;
        public float maxSuspensionTravel;
        /// <summary>Hard clamp on spring force (N).</summary>
        public float maxSuspensionForce;
        /// <summary>Longitudinal grip coefficient (drives the friction circle radius).</summary>
        public float frictionSlip;
        /// <summary>Lateral grip stiffness (0..~1.2): how hard the tyre resists sideways slip.</summary>
        public float sideFrictionStiffness;
        public bool steered;
        public bool driven;
        public bool handbrake;
    }

    /// <summary>Arcade assists layered on top of the raw raycast physics.</summary>
    [Serializable]
    public struct ArcadeAids
    {
        public float downforce;      // extra grip via speed-scaled down-push
        public float gripAssist;     // added lateral grip (forgiving cornering)
        public float gripFadeSpeed;  // speed (m/s) at which raw grip starts fading
        public float antiRoll;       // uprighting stiffness (keeps it on its wheels)
        public float antiRollDamp;
        public float driftFrictionMul; // rear long. grip multiplier while handbraking
        public float driftSideMul;     // rear lateral grip multiplier while handbraking

        public static ArcadeAids Default => new ArcadeAids
        {
            downforce = 6f, gripAssist = 0.2f, gripFadeSpeed = 22f,
            antiRoll = 18f, antiRollDamp = 2.5f,
            driftFrictionMul = 0.55f, driftSideMul = 0.5f,
        };
    }

    /// <summary>Full handling profile for one vehicle (ported from presets.ts).</summary>
    [Serializable]
    public sealed class VehicleConfig
    {
        public string id = "sedan";
        public float mass = 1250f;
        public Vector3 chassisHalfExtents = new Vector3(0.9f, 0.5f, 2.1f);
        public Vector3 centerOfMassOffset = new Vector3(0f, -0.4f, 0f);
        public float linearDamping = 0.05f;
        public float angularDamping = 0.6f;

        public float engineForce = 4200f;
        public float reverseForce = 2200f;
        public float brakeForce = 2600f;
        public float handbrakeForce = 3600f;

        /// <summary>Max steer at the wheel (radians).</summary>
        public float maxSteer = 0.55f;
        public float steerSign = -1f;
        /// <summary>Speed (m/s) reference for the steer-fade curve.</summary>
        public float steerSpeedRef = 28f;
        /// <summary>Fraction of max steer still available at top speed (0..1).</summary>
        public float steerAtMaxSpeed = 0.22f;
        /// <summary>How fast the steer angle chases its target (higher = snappier).</summary>
        public float steerDampRate = 9f;
        public float topSpeedKmh = 180f;
        public int gears = 5;

        public WheelSpec[] wheels = Array.Empty<WheelSpec>();
        public ArcadeAids arcade = ArcadeAids.Default;
        public Color color = new Color(0.231f, 0.431f, 0.647f); // #3b6ea5

        // ── Wheel-layout helper (mirrors presets.ts makeWheels) ──────────────
        struct Layout
        {
            public float halfTrack, frontZ, rearZ, connectionY, radius, restLength;
            public float stiffness, compression, relaxation, maxTravel, maxForce;
            public float frontFriction, rearFriction, sideFriction;
            public bool fwd;
        }

        static WheelSpec[] MakeWheels(Layout l)
        {
            WheelSpec Mk(float x, float z, bool steered, bool driven, bool handbrake, float fric) => new WheelSpec
            {
                position = new Vector3(x, l.connectionY, z),
                radius = l.radius,
                suspensionRestLength = l.restLength,
                suspensionStiffness = l.stiffness,
                suspensionCompression = l.compression,
                suspensionRelaxation = l.relaxation,
                maxSuspensionTravel = l.maxTravel,
                maxSuspensionForce = l.maxForce,
                sideFrictionStiffness = l.sideFriction,
                frictionSlip = fric,
                steered = steered,
                driven = driven,
                handbrake = handbrake,
            };
            bool rearDriven = !l.fwd, frontDriven = l.fwd;
            return new[]
            {
                Mk(-l.halfTrack, l.frontZ, true,  frontDriven, false, l.frontFriction), // FL
                Mk( l.halfTrack, l.frontZ, true,  frontDriven, false, l.frontFriction), // FR
                Mk(-l.halfTrack, l.rearZ,  false, rearDriven,  true,  l.rearFriction),  // RL
                Mk( l.halfTrack, l.rearZ,  false, rearDriven,  true,  l.rearFriction),  // RR
            };
        }

        static Color Hex(string hex)
        {
            ColorUtility.TryParseHtmlString(hex, out Color c);
            return c;
        }

        // ── Ported presets (the shared VehicleId roster from presets.ts) ─────

        public static VehicleConfig Sedan() => new VehicleConfig
        {
            id = "sedan", mass = 1250f,
            chassisHalfExtents = new Vector3(0.9f, 0.5f, 2.1f),
            centerOfMassOffset = new Vector3(0f, -0.4f, 0f),
            linearDamping = 0.05f, angularDamping = 0.6f,
            engineForce = 4200f, reverseForce = 2200f, brakeForce = 2600f, handbrakeForce = 3600f,
            maxSteer = 0.55f, steerSign = -1f, steerSpeedRef = 28f, steerAtMaxSpeed = 0.22f,
            steerDampRate = 9f, topSpeedKmh = 180f, gears = 5,
            wheels = MakeWheels(new Layout
            {
                halfTrack = 0.85f, frontZ = 1.45f, rearZ = -1.45f, connectionY = -0.25f,
                radius = 0.36f, restLength = 0.35f, stiffness = 24f, compression = 0.82f,
                relaxation = 0.88f, maxTravel = 0.28f, maxForce = 60000f,
                frontFriction = 1.9f, rearFriction = 2.0f, sideFriction = 0.9f,
            }),
            arcade = ArcadeAids.Default,
            color = Hex("#3b6ea5"),
        };

        public static VehicleConfig Coupe()
        {
            var c = Sedan();
            c.id = "coupe"; c.mass = 1150f;
            c.chassisHalfExtents = new Vector3(0.88f, 0.46f, 2.0f);
            c.engineForce = 4200f; c.topSpeedKmh = 200f; c.steerAtMaxSpeed = 0.26f;
            c.color = Hex("#b5423a");
            c.wheels = MakeWheels(new Layout
            {
                halfTrack = 0.85f, frontZ = 1.38f, rearZ = -1.38f, connectionY = -0.22f,
                radius = 0.35f, restLength = 0.32f, stiffness = 26f, compression = 0.84f,
                relaxation = 0.9f, maxTravel = 0.24f, maxForce = 60000f,
                frontFriction = 2.0f, rearFriction = 2.1f, sideFriction = 0.95f,
            });
            return c;
        }

        public static VehicleConfig Sports()
        {
            var c = Sedan();
            c.id = "sports"; c.mass = 1050f;
            c.chassisHalfExtents = new Vector3(0.92f, 0.42f, 2.05f);
            c.centerOfMassOffset = new Vector3(0f, -0.45f, 0f);
            c.engineForce = 5200f; c.reverseForce = 2200f; c.brakeForce = 3000f;
            c.topSpeedKmh = 235f; c.maxSteer = 0.5f; c.steerAtMaxSpeed = 0.3f; c.steerDampRate = 11f;
            c.color = Hex("#d1b24a");
            c.arcade = new ArcadeAids
            {
                downforce = 9f, gripAssist = 0.28f, gripFadeSpeed = 26f,
                antiRoll = 18f, antiRollDamp = 2.5f, driftFrictionMul = 0.55f, driftSideMul = 0.5f,
            };
            c.wheels = MakeWheels(new Layout
            {
                halfTrack = 0.9f, frontZ = 1.4f, rearZ = -1.4f, connectionY = -0.2f,
                radius = 0.35f, restLength = 0.3f, stiffness = 30f, compression = 0.86f,
                relaxation = 0.92f, maxTravel = 0.22f, maxForce = 65000f,
                frontFriction = 2.2f, rearFriction = 2.3f, sideFriction = 1.05f,
            });
            return c;
        }

        public static VehicleConfig Suv()
        {
            var c = Sedan();
            c.id = "suv"; c.mass = 1750f;
            c.chassisHalfExtents = new Vector3(1.0f, 0.7f, 2.3f);
            c.centerOfMassOffset = new Vector3(0f, -0.5f, 0f);
            c.engineForce = 4200f; c.reverseForce = 2100f; c.brakeForce = 2600f; c.handbrakeForce = 4000f;
            c.maxSteer = 0.52f; c.steerAtMaxSpeed = 0.2f; c.topSpeedKmh = 165f;
            c.color = Hex("#4a5d4f");
            c.arcade = new ArcadeAids
            {
                downforce = 5f, gripAssist = 0.3f, gripFadeSpeed = 22f,
                antiRoll = 34f, antiRollDamp = 2.5f, driftFrictionMul = 0.55f, driftSideMul = 0.5f,
            };
            c.wheels = MakeWheels(new Layout
            {
                halfTrack = 0.95f, frontZ = 1.55f, rearZ = -1.55f, connectionY = -0.28f,
                radius = 0.42f, restLength = 0.42f, stiffness = 22f, compression = 0.8f,
                relaxation = 0.86f, maxTravel = 0.34f, maxForce = 80000f,
                frontFriction = 1.9f, rearFriction = 2.0f, sideFriction = 0.85f,
            });
            return c;
        }

        public static VehicleConfig Police()
        {
            var c = Sedan();
            c.id = "police"; c.mass = 1300f;
            c.engineForce = 4400f; c.brakeForce = 2700f; c.topSpeedKmh = 195f; c.steerAtMaxSpeed = 0.26f;
            c.color = Hex("#26303f");
            c.arcade.downforce = 8f; c.arcade.gripAssist = 0.36f;
            return c;
        }
    }
}
