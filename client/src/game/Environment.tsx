import { useMemo } from "react";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { DEG2RAD, Layer, groupsFor } from "@sunbreak/shared";
import { makeGridTexture } from "../util/textures";

const GROUND_HALF = 100;

/** The v0 test playground: a textured ground plane + a block, a slope ramp, and a curb/step so
 *  the character controller's autostep, slopes, snapping, and collision are all demonstrable. */
export function Environment() {
  const groundTex = useMemo(() => {
    const t = makeGridTexture(512, 8, "#2f3440", "#465065");
    t.repeat.set(GROUND_HALF, GROUND_HALF);
    return t;
  }, []);
  const blockTex = useMemo(() => makeGridTexture(256, 4, "#6b5a44", "#8a765a"), []);

  return (
    <>
      {/* Ground */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[GROUND_HALF, 0.5, GROUND_HALF]}
          position={[0, -0.5, 0]}
          collisionGroups={groupsFor(Layer.WORLD)}
        />
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[GROUND_HALF * 2, GROUND_HALF * 2]} />
          <meshStandardMaterial map={groundTex} roughness={0.96} metalness={0} />
        </mesh>
      </RigidBody>

      {/* Central textured block */}
      <RigidBody type="fixed" colliders={false} position={[0, 1, -8]}>
        <CuboidCollider args={[3, 1, 3]} collisionGroups={groupsFor(Layer.WORLD)} />
        <mesh castShadow receiveShadow>
          <boxGeometry args={[6, 2, 6]} />
          <meshStandardMaterial map={blockTex} roughness={0.85} />
        </mesh>
      </RigidBody>

      {/* Slope ramp (~20°) */}
      <RigidBody type="fixed" colliders={false} position={[11, 0.35, 0]} rotation={[0, 0, -20 * DEG2RAD]}>
        <CuboidCollider args={[3, 0.25, 2.5]} collisionGroups={groupsFor(Layer.WORLD)} />
        <mesh castShadow receiveShadow>
          <boxGeometry args={[6, 0.5, 5]} />
          <meshStandardMaterial color="#7a8494" roughness={0.9} />
        </mesh>
      </RigidBody>

      {/* Curb / step (tests autostep) */}
      <RigidBody type="fixed" colliders={false} position={[-9, 0.15, 0]}>
        <CuboidCollider args={[2.5, 0.15, 2.5]} collisionGroups={groupsFor(Layer.WORLD)} />
        <mesh castShadow receiveShadow>
          <boxGeometry args={[5, 0.3, 5]} />
          <meshStandardMaterial color="#8a8f99" roughness={0.9} />
        </mesh>
      </RigidBody>

      {/* A couple of pillars for the camera spring-arm to collide against */}
      {[
        [6, 2, 6],
        [-6, 2, 8],
      ].map(([x, y, z]) => (
        <RigidBody key={`${x},${z}`} type="fixed" colliders={false} position={[x!, y!, z!]}>
          <CuboidCollider args={[0.6, 2, 0.6]} collisionGroups={groupsFor(Layer.WORLD)} />
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1.2, 4, 1.2]} />
            <meshStandardMaterial color="#586074" roughness={0.8} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
