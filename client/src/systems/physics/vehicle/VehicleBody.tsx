// R3F view for a single vehicle ECS entity: a dynamic chassis RigidBody (one cuboid collider,
// lowered center of mass, CCD) plus four raycast-driven wheel groups. This is the ECS↔R3F
// bridge leaf — it owns no gameplay logic; `useVehicleController` attaches the live handle and
// `three`/`rigidBody` view components back onto the entity.
import { useMemo, useRef } from "react";
import type * as THREE from "three";
import { CuboidCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { Layer, groupsFor } from "@sunbreak/shared";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { VehicleConfig } from "./types";
import { computeChassisInertia, resolveVehicleConfig } from "./presets";
import { useVehicleController } from "./useVehicleController";

const WHEEL_WIDTH = 0.24;

function resolveConfig(entity: ClientEntity): VehicleConfig {
  if (entity.veh_config) return entity.veh_config;
  const req = entity.veh_spawnRequest;
  return resolveVehicleConfig(req?.spec ?? "sedan", req?.color);
}

export function VehicleBody({ entity }: { entity: ClientEntity }) {
  const chassisRef = useRef<RapierRigidBody>(null);
  const visualRef = useRef<THREE.Group>(null);
  const wheelRefs = useRef<(THREE.Group | null)[]>([]);

  const config = useMemo(() => resolveConfig(entity), [entity]);

  const initial = useMemo(() => {
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

  const inertia = useMemo(
    () => computeChassisInertia(config.mass, config.chassisHalfExtents),
    [config],
  );

  useVehicleController(entity, config, chassisRef, visualRef, wheelRefs);

  const [hx, hy, hz] = config.chassisHalfExtents;
  const [comX, comY, comZ] = config.centerOfMassOffset;

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
        collisionGroups={groupsFor(Layer.VEHICLE)}
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
        {/* Body */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[hx * 2, hy * 2, hz * 2]} />
          <meshStandardMaterial color={config.color} roughness={0.4} metalness={0.5} />
        </mesh>

        {/* Cabin / greenhouse (set slightly back from the +Z nose) */}
        <mesh castShadow position={[0, hy + hy * 0.55, -hz * 0.1]}>
          <boxGeometry args={[hx * 1.7, hy * 1.1, hz * 1.05]} />
          <meshStandardMaterial color="#11151b" roughness={0.25} metalness={0.2} />
        </mesh>

        {/* Headlights (forward = +Z cue) */}
        {[-hx * 0.6, hx * 0.6].map((x) => (
          <mesh key={x} position={[x, -hy * 0.1, hz + 0.02]}>
            <boxGeometry args={[hx * 0.5, hy * 0.35, 0.06]} />
            <meshStandardMaterial
              color="#fff4d6"
              emissive="#ffe9b0"
              emissiveIntensity={0.6}
              roughness={0.3}
            />
          </mesh>
        ))}

        {/* Wheels — position/orientation are driven every step by the controller. */}
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
            {/* Hub cap so wheel spin is visible */}
            <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[w.radius * 0.45, w.radius * 0.45, WHEEL_WIDTH + 0.01, 10]} />
              <meshStandardMaterial color="#8a9099" roughness={0.4} metalness={0.7} />
            </mesh>
          </group>
        ))}
      </group>
    </RigidBody>
  );
}
