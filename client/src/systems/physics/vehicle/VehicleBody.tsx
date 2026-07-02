// R3F view for a single vehicle ECS entity — the ECS↔R3F bridge leaf. Dispatches on the
// resolved config's `kind`:
//   • car / bike → a dynamic chassis + raycast wheels driven by useVehicleController.
//   • heli / plane / boat → a dynamic chassis driven by the arcade flight/boat models
//     (useDynamicVehicleController); rotor/prop groups are spun each step.
// It owns no gameplay logic; the controllers attach the live handle + `three`/`rigidBody`
// view components back onto the entity.
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import {
  CoefficientCombineRule,
  CuboidCollider,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import { Layer, groupsFor } from "@sunbreak/shared";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { VehicleConfig } from "./types";
import { computeChassisInertia, kindOf, resolveVehicleConfig } from "./presets";
import { useVehicleController } from "./useVehicleController";
import { useDynamicVehicleController } from "./useDynamicController";

const WHEEL_WIDTH = 0.24;
const VEH_GROUPS = groupsFor(Layer.VEHICLE);

function resolveConfig(entity: ClientEntity): VehicleConfig {
  if (entity.veh_config) return entity.veh_config;
  const req = entity.veh_spawnRequest;
  return resolveVehicleConfig(req?.spec ?? "sedan", req?.color);
}

function useInitialTransform(entity: ClientEntity) {
  return useMemo(() => {
    const tf = entity.transform;
    const req = entity.veh_spawnRequest;
    const position: [number, number, number] = tf
      ? [tf.position.x, tf.position.y, tf.position.z]
      : req
        ? [req.position[0], req.position[1], req.position[2]]
        : [0, 2, 0];
    const quaternion: [number, number, number, number] = tf
      ? [tf.rotation.x, tf.rotation.y, tf.rotation.z, tf.rotation.w]
      : [0, 0, 0, 1];
    return { position, quaternion };
  }, [entity]);
}

/** Ref-callback factory: records a spinning group at index `i` + tags its spin axis. */
const rotorRef =
  (arr: MutableRefObject<(THREE.Object3D | null)[]>, i: number, axis: "x" | "y" | "z") =>
  (el: THREE.Object3D | null) => {
    arr.current[i] = el;
    if (el) el.userData.spinAxis = axis;
  };

// ─── Wheels (car + bike) ─────────────────────────────────────────────────────────────────────
function Wheels({
  config,
  wheelRefs,
}: {
  config: VehicleConfig;
  wheelRefs: MutableRefObject<(THREE.Group | null)[]>;
}) {
  return (
    <>
      {config.wheels.map((w, i) => (
        <group
          key={i}
          ref={(el) => {
            wheelRefs.current[i] = el;
          }}
          position={[w.position[0], w.position[1] - w.suspensionRestLength, w.position[2]]}
        >
          <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[w.radius, w.radius, WHEEL_WIDTH, 18]} />
            <meshStandardMaterial color="#15171c" roughness={0.85} metalness={0.1} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[w.radius * 0.45, w.radius * 0.45, WHEEL_WIDTH + 0.01, 10]} />
            <meshStandardMaterial color="#8a9099" roughness={0.4} metalness={0.7} />
          </mesh>
        </group>
      ))}
    </>
  );
}

// ─── Body visuals ──────────────────────────────────────────────────────────────────────────
function CarBody({ config }: { config: VehicleConfig }) {
  const [hx, hy, hz] = config.chassisHalfExtents;
  return (
    <>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[hx * 2, hy * 2, hz * 2]} />
        <meshStandardMaterial color={config.color} roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh castShadow position={[0, hy + hy * 0.55, -hz * 0.1]}>
        <boxGeometry args={[hx * 1.7, hy * 1.1, hz * 1.05]} />
        <meshStandardMaterial color="#11151b" roughness={0.25} metalness={0.2} />
      </mesh>
      {[-hx * 0.6, hx * 0.6].map((x) => (
        <mesh key={x} position={[x, -hy * 0.1, hz + 0.02]}>
          <boxGeometry args={[hx * 0.5, hy * 0.35, 0.06]} />
          <meshStandardMaterial color="#fff4d6" emissive="#ffe9b0" emissiveIntensity={0.6} roughness={0.3} />
        </mesh>
      ))}
    </>
  );
}

function BikeBody({ config }: { config: VehicleConfig }) {
  const [hx, hy, hz] = config.chassisHalfExtents;
  return (
    <>
      {/* Frame / tank */}
      <mesh castShadow position={[0, hy * 0.2, 0]}>
        <boxGeometry args={[hx * 1.5, hy * 1.1, hz * 1.5]} />
        <meshStandardMaterial color={config.color} roughness={0.35} metalness={0.55} />
      </mesh>
      {/* Seat */}
      <mesh castShadow position={[0, hy * 0.95, -hz * 0.35]}>
        <boxGeometry args={[hx * 1.2, hy * 0.5, hz * 0.7]} />
        <meshStandardMaterial color="#101216" roughness={0.6} metalness={0.1} />
      </mesh>
      {/* Fairing / headlight */}
      <mesh position={[0, hy * 0.35, hz * 0.92]}>
        <boxGeometry args={[hx * 1.2, hy * 0.7, hz * 0.25]} />
        <meshStandardMaterial color="#fff4d6" emissive="#ffe9b0" emissiveIntensity={0.5} roughness={0.3} />
      </mesh>
      {/* Handlebars */}
      <mesh position={[0, hy * 1.0, hz * 0.7]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, hx * 2.4, 8]} />
        <meshStandardMaterial color="#2b2f36" metalness={0.7} roughness={0.4} />
      </mesh>
    </>
  );
}

function HelicopterVisual({
  config,
  rotorRefs,
}: {
  config: VehicleConfig;
  rotorRefs: MutableRefObject<(THREE.Object3D | null)[]>;
}) {
  const [hx, hy, hz] = config.chassisHalfExtents;
  const tailLen = hz * 1.7;
  return (
    <>
      {/* Cabin */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[hx * 2, hy * 2, hz * 2]} />
        <meshStandardMaterial color={config.color} roughness={0.45} metalness={0.45} />
      </mesh>
      {/* Nose canopy */}
      <mesh castShadow position={[0, hy * 0.25, hz * 0.85]}>
        <sphereGeometry args={[hx * 0.95, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        <meshStandardMaterial color="#182028" roughness={0.15} metalness={0.3} transparent opacity={0.85} />
      </mesh>
      {/* Tail boom */}
      <mesh castShadow position={[0, hy * 0.4, -hz - tailLen * 0.5]}>
        <boxGeometry args={[hx * 0.35, hy * 0.4, tailLen]} />
        <meshStandardMaterial color={config.color} roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Tail fin */}
      <mesh castShadow position={[0, hy * 0.9, -hz - tailLen]}>
        <boxGeometry args={[hx * 0.18, hy * 1.1, hz * 0.5]} />
        <meshStandardMaterial color={config.color} roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Skids */}
      {[-hx * 0.8, hx * 0.8].map((x) => (
        <mesh key={x} castShadow position={[x, -hy - 0.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.06, hz * 2.1, 8]} />
          <meshStandardMaterial color="#20242c" metalness={0.6} roughness={0.5} />
        </mesh>
      ))}
      {/* Main rotor (spins about Y) */}
      <group ref={rotorRef(rotorRefs, 0, "y")} position={[0, hy + 0.35, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.12, 0.12, 0.18, 8]} />
          <meshStandardMaterial color="#15171c" metalness={0.7} roughness={0.4} />
        </mesh>
        {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((a) => (
          <mesh key={a} rotation={[0, a, 0]} position={[hz * 1.1, 0.12, 0]} castShadow>
            <boxGeometry args={[hz * 2.3, 0.04, 0.22]} />
            <meshStandardMaterial color="#0d0f13" roughness={0.6} metalness={0.2} />
          </mesh>
        ))}
      </group>
      {/* Tail rotor (spins about X) */}
      <group ref={rotorRef(rotorRefs, 1, "x")} position={[hx * 0.28, hy * 0.9, -hz - tailLen]}>
        {[0, Math.PI / 2].map((a) => (
          <mesh key={a} rotation={[a, 0, 0]} position={[0, hy * 0.5, 0]}>
            <boxGeometry args={[0.05, hy * 1.0, 0.12]} />
            <meshStandardMaterial color="#0d0f13" roughness={0.6} />
          </mesh>
        ))}
      </group>
    </>
  );
}

function PlaneVisual({
  config,
  rotorRefs,
}: {
  config: VehicleConfig;
  rotorRefs: MutableRefObject<(THREE.Object3D | null)[]>;
}) {
  const [hx, hy, hz] = config.chassisHalfExtents;
  const wingSpan = hx * 7;
  return (
    <>
      {/* Fuselage */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[hx * 2, hy * 2, hz * 2]} />
        <meshStandardMaterial color={config.color} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Nose cone */}
      <mesh castShadow position={[0, 0, hz + 0.35]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[hx * 0.9, 0.9, 16]} />
        <meshStandardMaterial color="#3a3f47" metalness={0.6} roughness={0.35} />
      </mesh>
      {/* Canopy */}
      <mesh castShadow position={[0, hy + 0.1, hz * 0.35]}>
        <sphereGeometry args={[hx * 0.8, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial color="#182028" roughness={0.15} metalness={0.3} transparent opacity={0.85} />
      </mesh>
      {/* Main wings */}
      <mesh castShadow position={[0, 0, hz * 0.15]}>
        <boxGeometry args={[wingSpan, 0.12, hz * 0.75]} />
        <meshStandardMaterial color={config.color} roughness={0.45} metalness={0.45} />
      </mesh>
      {/* Tailplane */}
      <mesh castShadow position={[0, 0, -hz * 0.9]}>
        <boxGeometry args={[wingSpan * 0.42, 0.1, hz * 0.4]} />
        <meshStandardMaterial color={config.color} roughness={0.45} metalness={0.45} />
      </mesh>
      {/* Vertical stabilizer */}
      <mesh castShadow position={[0, hy + 0.35, -hz * 0.9]}>
        <boxGeometry args={[0.1, hy * 1.4, hz * 0.5]} />
        <meshStandardMaterial color={config.color} roughness={0.45} metalness={0.45} />
      </mesh>
      {/* Fixed landing gear (visual) */}
      {[-hx * 0.9, hx * 0.9].map((x) => (
        <mesh key={x} position={[x, -hy - 0.28, hz * 0.1]}>
          <boxGeometry args={[0.1, 0.55, 0.12]} />
          <meshStandardMaterial color="#20242c" metalness={0.5} roughness={0.6} />
        </mesh>
      ))}
      {/* Propeller (spins about Z) */}
      <group ref={rotorRef(rotorRefs, 0, "z")} position={[0, 0, hz + 0.85]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.2, 8]} />
          <meshStandardMaterial color="#15171c" metalness={0.7} roughness={0.4} />
        </mesh>
        {[0, Math.PI / 2].map((a) => (
          <mesh key={a} rotation={[0, 0, a]} castShadow>
            <boxGeometry args={[0.14, hx * 2.6, 0.03]} />
            <meshStandardMaterial color="#0d0f13" roughness={0.5} />
          </mesh>
        ))}
      </group>
    </>
  );
}

function BoatVisual({ config }: { config: VehicleConfig }) {
  const [hx, hy, hz] = config.chassisHalfExtents;
  return (
    <>
      {/* Hull */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[hx * 2, hy * 2, hz * 2]} />
        <meshStandardMaterial color={config.color} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Bow wedge */}
      <mesh castShadow position={[0, 0, hz + 0.45]} rotation={[Math.PI / 2, Math.PI / 4, 0]}>
        <coneGeometry args={[hx * 1.02, 1.4, 4]} />
        <meshStandardMaterial color={config.color} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Deck */}
      <mesh receiveShadow position={[0, hy + 0.02, 0]}>
        <boxGeometry args={[hx * 1.85, 0.06, hz * 1.9]} />
        <meshStandardMaterial color="#b5a37e" roughness={0.8} metalness={0.05} />
      </mesh>
      {/* Cabin / windshield */}
      <mesh castShadow position={[0, hy + 0.45, hz * 0.15]}>
        <boxGeometry args={[hx * 1.3, hy * 1.1, hz * 0.7]} />
        <meshStandardMaterial color="#e9edf2" roughness={0.3} metalness={0.2} />
      </mesh>
      <mesh position={[0, hy + 0.5, hz * 0.5]}>
        <boxGeometry args={[hx * 1.1, hy * 0.7, 0.05]} />
        <meshStandardMaterial color="#182028" roughness={0.15} metalness={0.3} transparent opacity={0.8} />
      </mesh>
    </>
  );
}

// ─── Wheeled path (car + bike) ───────────────────────────────────────────────────────────────
function WheeledBody({ entity, config }: { entity: ClientEntity; config: VehicleConfig }) {
  const chassisRef = useRef<RapierRigidBody>(null);
  const visualRef = useRef<THREE.Group>(null);
  const wheelRefs = useRef<(THREE.Group | null)[]>([]);
  const initial = useInitialTransform(entity);
  const inertia = useMemo(
    () => computeChassisInertia(config.mass, config.chassisHalfExtents),
    [config],
  );

  useVehicleController(entity, config, chassisRef, visualRef, wheelRefs);

  const [hx, hy, hz] = config.chassisHalfExtents;
  const [comX, comY, comZ] = config.centerOfMassOffset;
  const bike = kindOf(config) === "bike";

  return (
    <RigidBody
      ref={chassisRef}
      type="dynamic"
      colliders={false}
      canSleep={false}
      ccd
      linearDamping={config.linearDamping}
      angularDamping={config.angularDamping}
      position={initial.position}
      quaternion={initial.quaternion}
    >
      <CuboidCollider
        args={[hx, hy, hz]}
        collisionGroups={VEH_GROUPS}
        friction={0.4}
        restitution={0.05}
        massProperties={{
          mass: config.mass,
          centerOfMass: { x: comX, y: comY, z: comZ },
          principalAngularInertia: { x: inertia[0], y: inertia[1], z: inertia[2] },
          angularInertiaLocalFrame: { x: 0, y: 0, z: 0, w: 1 },
        }}
      />
      <group ref={visualRef} name={`veh:${entity.netId ?? "local"}`}>
        {bike ? <BikeBody config={config} /> : <CarBody config={config} />}
        <Wheels config={config} wheelRefs={wheelRefs} />
      </group>
    </RigidBody>
  );
}

// ─── Dynamic path (heli / plane / boat) ────────────────────────────────────────────────────────
function DynamicBody({ entity, config }: { entity: ClientEntity; config: VehicleConfig }) {
  const chassisRef = useRef<RapierRigidBody>(null);
  const visualRef = useRef<THREE.Group>(null);
  const rotorRefs = useRef<(THREE.Object3D | null)[]>([]);
  const initial = useInitialTransform(entity);
  const inertia = useMemo(
    () => computeChassisInertia(config.mass, config.chassisHalfExtents),
    [config],
  );

  useDynamicVehicleController(entity, config, chassisRef, visualRef, rotorRefs);

  const kind = kindOf(config);
  const [hx, hy, hz] = config.chassisHalfExtents;
  const [comX, comY, comZ] = config.centerOfMassOffset;
  // Planes need a slippery footprint so they can build speed on the runway (min-rule keeps the
  // number honest regardless of the terrain's friction); boats/helis want a little grip.
  const friction = kind === "plane" ? 0.12 : kind === "boat" ? 0.2 : 0.6;

  return (
    <RigidBody
      ref={chassisRef}
      type="dynamic"
      colliders={false}
      canSleep={false}
      ccd
      linearDamping={config.linearDamping}
      angularDamping={config.angularDamping}
      position={initial.position}
      quaternion={initial.quaternion}
    >
      <CuboidCollider
        args={[hx, hy, hz]}
        collisionGroups={VEH_GROUPS}
        friction={friction}
        frictionCombineRule={kind === "plane" ? CoefficientCombineRule.Min : undefined}
        restitution={0.05}
        massProperties={{
          mass: config.mass,
          centerOfMass: { x: comX, y: comY, z: comZ },
          principalAngularInertia: { x: inertia[0], y: inertia[1], z: inertia[2] },
          angularInertiaLocalFrame: { x: 0, y: 0, z: 0, w: 1 },
        }}
      />
      <group ref={visualRef} name={`veh:${entity.netId ?? "local"}`}>
        {kind === "heli" && <HelicopterVisual config={config} rotorRefs={rotorRefs} />}
        {kind === "plane" && <PlaneVisual config={config} rotorRefs={rotorRefs} />}
        {kind === "boat" && <BoatVisual config={config} />}
      </group>
    </RigidBody>
  );
}

export function VehicleBody({ entity }: { entity: ClientEntity }) {
  const config = useMemo(() => resolveConfig(entity), [entity]);
  const kind = kindOf(config);
  const wheeled = kind === "car" || kind === "bike";
  return wheeled ? (
    <WheeledBody entity={entity} config={config} />
  ) : (
    <DynamicBody entity={entity} config={config} />
  );
}
