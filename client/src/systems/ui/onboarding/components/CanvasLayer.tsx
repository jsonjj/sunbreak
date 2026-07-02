// OPTIONAL in-world layer for the intro slice. The integrator mounts it INSIDE <Canvas> (e.g.
// alongside <SystemsRunner/>). It renders the drive waypoint + breakable can targets straight
// from the ECS (reusing the ECS↔R3F bridge — no hand-mounting into Scene) and does crosshair
// raycast hit-detection on fire. If it's NOT mounted, the runner falls back to counting shots,
// so the walk→drive→shoot slice still completes. Its presence flips `canvasMounted` in the store.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree, useFrame } from "@react-three/fiber";
import { InputAction } from "@sunbreak/shared";
import { world, ECS } from "@/ecs/world";
import { input } from "@/input/InputManager";
import type { ClientEntity } from "@/ecs/clientEntity";
import { emitGameEvent } from "../bus";
import { useOnboardingStore } from "../store";
import { onbQueries } from "../queries";

const CENTER = new THREE.Vector2(0, 0);

export function OnboardingCanvasLayer() {
  const camera = useThree((s) => s.camera);
  const targetsGroup = useRef<THREE.Group>(null);
  const raycaster = useRef(new THREE.Raycaster());

  useEffect(() => {
    useOnboardingStore.getState().setCanvasMounted(true);
    return () => useOnboardingStore.getState().setCanvasMounted(false);
  }, []);

  // Crosshair raycast on fire, only during the shooting beat.
  useFrame(() => {
    if (useOnboardingStore.getState().beatId !== "shoot") return;
    if (!input.snapshot.justPressed.has(InputAction.Fire)) return;
    const group = targetsGroup.current;
    if (!group) return;

    raycaster.current.setFromCamera(CENTER, camera);
    const hit = raycaster.current.intersectObjects(group.children, true)[0];
    if (!hit) return;

    let obj: THREE.Object3D | null = hit.object;
    while (obj && obj.userData?.targetId == null) obj = obj.parent;
    if (!obj) return;

    const entity = obj.userData.entity as ClientEntity | undefined;
    const id = obj.userData.targetId as string;
    if (entity && !entity.onb_hit) {
      world.addComponent(entity, "onb_hit", true); // drops it from the targets query → unmounts
      emitGameEvent("combat:hitTarget", { id });
    }
  });

  return (
    <>
      <ECS.Entities in={onbQueries.markers}>
        {(e) => (
          <group
            position={[e.transform.position.x, e.transform.position.y, e.transform.position.z]}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <torusGeometry args={[e.onb_marker.radius, 0.12, 12, 56]} />
              <meshStandardMaterial
                color="#ffd166"
                emissive="#ff8a4c"
                emissiveIntensity={0.9}
                transparent
                opacity={0.92}
              />
            </mesh>
            <mesh position={[0, 4, 0]}>
              <cylinderGeometry args={[0.06, 0.06, 8, 8]} />
              <meshStandardMaterial
                color="#ffd166"
                emissive="#ff8a4c"
                emissiveIntensity={0.6}
                transparent
                opacity={0.28}
              />
            </mesh>
          </group>
        )}
      </ECS.Entities>

      <group ref={targetsGroup}>
        <ECS.Entities in={onbQueries.targets}>
          {(e) => (
            <mesh
              position={[e.transform.position.x, e.transform.position.y, e.transform.position.z]}
              castShadow
              userData={{ targetId: e.onb_target.id, entity: e }}
            >
              <cylinderGeometry args={[0.18, 0.2, 0.5, 16]} />
              <meshStandardMaterial color="#eef3ff" metalness={0.35} roughness={0.4} />
            </mesh>
          )}
        </ECS.Entities>
      </group>
    </>
  );
}
