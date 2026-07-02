// Discoverable vehicle landmarks + their world coordinates: a beachfront HELIPAD, a coastal
// AIRSTRIP, and a MARINA pier on the bay. These are the acquisition points the gameplay spawner
// seeds craft onto (see gameplay/vehicle-gameplay/spawns.ts, which imports LANDMARKS from here so
// there is a single source of truth). Rendered from <VehiclePhysicsView> so the thin WORLD
// colliders live inside the Rapier tree (the player can walk the pier / helipad; the runway is a
// flat drivable strip). Everything is cosmetic + a flat surface — craft also settle onto terrain,
// so exact heights are forgiving (procedural terrain → confirm final placement in-browser).
import { CuboidCollider, CylinderCollider, RigidBody } from "@react-three/rapier";
import { Layer, groupsFor } from "@sunbreak/shared";
import { DISTRICTS, MARINA, WATER_LEVEL } from "@/systems/render/city/geography";

const WORLD_GROUPS = groupsFor(Layer.WORLD);

// Sol Verano Airfield apron rect from the shared island geography — heli + plane acquisition live here.
const AIRFIELD = DISTRICTS.find((d) => d.key === "airfield")!.rect;

/** World coordinates of the vehicle acquisition points (metres). Sourced from the island geography
 *  so they can never drift: helicopter + plane on the Airfield apron, boats in the SW Marina. */
export const LANDMARKS = {
  /** Airfield helipad (flat circular pad, apron NW) — spawns the helicopter. */
  helipad: { x: AIRFIELD.x0 + 40, z: AIRFIELD.z0 + 45, radius: 8, topY: 0.25 },
  /** Airfield runway — a long flat strip along +X; the plane departs toward +X. */
  runway: {
    x: (AIRFIELD.x0 + AIRFIELD.x1) / 2,
    z: AIRFIELD.z1 - 45,
    halfLength: 72,
    halfWidth: 8,
    topY: 0.3,
    headingY: Math.PI / 2,
  },
  /** Marina pier — runs from the north (land) south into the harbour basin; boats moor seaward. */
  marina: { x: MARINA.x, z: MARINA.z - 55, halfX: 2.2, halfZ: 62, deckY: WATER_LEVEL + 1.6 },
  /** Harbour basin (mirrors geography MARINA + WATER_LEVEL) — boats float here. */
  bay: { x: MARINA.x, z: MARINA.z, radius: MARINA.radius, waterLevel: WATER_LEVEL },
} as const;

function Helipad() {
  const { x, z, radius, topY } = LANDMARKS.helipad;
  const bar = radius * 0.7;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]}>
      <CylinderCollider args={[topY / 2 + 0.05, radius]} position={[0, topY / 2, 0]} collisionGroups={WORLD_GROUPS} />
      {/* Pad slab */}
      <mesh receiveShadow position={[0, topY, 0]}>
        <cylinderGeometry args={[radius, radius, 0.06, 40]} />
        <meshStandardMaterial color="#23262d" roughness={0.9} metalness={0.1} />
      </mesh>
      {/* Ring */}
      <mesh position={[0, topY + 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.78, radius * 0.9, 48]} />
        <meshStandardMaterial color="#cfd5e3" roughness={0.6} />
      </mesh>
      {/* "H" marking */}
      {[-bar * 0.32, bar * 0.32].map((dx) => (
        <mesh key={dx} position={[dx, topY + 0.04, 0]}>
          <boxGeometry args={[bar * 0.16, 0.02, bar]} />
          <meshStandardMaterial color="#e8ecf2" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, topY + 0.04, 0]}>
        <boxGeometry args={[bar * 0.5, 0.02, bar * 0.18]} />
        <meshStandardMaterial color="#e8ecf2" roughness={0.6} />
      </mesh>
    </RigidBody>
  );
}

function Airstrip() {
  const { x, z, halfLength, halfWidth, topY } = LANDMARKS.runway;
  const dashes = 9;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]}>
      <CuboidCollider args={[halfLength, topY / 2 + 0.05, halfWidth]} position={[0, topY / 2, 0]} collisionGroups={WORLD_GROUPS} />
      {/* Tarmac */}
      <mesh receiveShadow position={[0, topY, 0]}>
        <boxGeometry args={[halfLength * 2, 0.06, halfWidth * 2]} />
        <meshStandardMaterial color="#2a2d34" roughness={0.95} metalness={0.05} />
      </mesh>
      {/* Centreline dashes (run along X) */}
      {Array.from({ length: dashes }, (_, i) => {
        const px = -halfLength + (halfLength * 2 * (i + 0.5)) / dashes;
        return (
          <mesh key={i} position={[px, topY + 0.035, 0]}>
            <boxGeometry args={[halfLength * 0.08, 0.02, 0.35]} />
            <meshStandardMaterial color="#d7dbe2" roughness={0.6} />
          </mesh>
        );
      })}
      {/* Threshold stripes at each end */}
      {[-halfLength + 1.2, halfLength - 1.2].map((px) =>
        [-2, -1, 0, 1, 2].map((k) => (
          <mesh key={`${px}:${k}`} position={[px, topY + 0.035, k * (halfWidth * 0.28)]}>
            <boxGeometry args={[1.8, 0.02, halfWidth * 0.16]} />
            <meshStandardMaterial color="#e8ecf2" roughness={0.6} />
          </mesh>
        )),
      )}
    </RigidBody>
  );
}

function Marina() {
  const { x, z, halfX, halfZ, deckY } = LANDMARKS.marina;
  return (
    <RigidBody type="fixed" colliders={false} position={[x, 0, z]}>
      {/* Walkable deck (long axis = Z, from the beach out into the bay) */}
      <CuboidCollider args={[halfX, 0.08, halfZ]} position={[0, deckY, 0]} collisionGroups={WORLD_GROUPS} />
      <mesh receiveShadow castShadow position={[0, deckY, 0]}>
        <boxGeometry args={[halfX * 2, 0.16, halfZ * 2]} />
        <meshStandardMaterial color="#6b5330" roughness={0.85} metalness={0.05} />
      </mesh>
      {/* Pilings down each side */}
      {Array.from({ length: 5 }, (_, i) => {
        const pz = -halfZ + (halfZ * 2 * i) / 4;
        return [-halfX, halfX].map((px) => (
          <mesh key={`${px}:${pz}`} castShadow position={[px, deckY - 1.4, pz]}>
            <cylinderGeometry args={[0.16, 0.16, 3, 8]} />
            <meshStandardMaterial color="#40352a" roughness={0.9} />
          </mesh>
        ));
      })}
    </RigidBody>
  );
}

/** All vehicle landmarks. Mounted once by <VehiclePhysicsView> (inside the Rapier tree). */
export function VehicleLandmarks() {
  return (
    <>
      <Helipad />
      <Airstrip />
      <Marina />
    </>
  );
}
