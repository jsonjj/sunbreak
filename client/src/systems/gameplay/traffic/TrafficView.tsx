// The ECS↔R3F bridge for traffic. The INTEGRATOR mounts this once, inside <Physics> (see the wiring
// note in index.ts) — we never hand-mount into App/Scene. While mounted it: (1) marks the sim active,
// (2) captures the camera into the view snapshot for off-screen spawning + LOD, (3) renders every car
// through its ECS `three` view component via <ECS.Entities> (no hand-built InstancedMesh), and
// (4) drives near-car kinematic bodies + crash promotion on the Rapier step hooks.
import { useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useAfterPhysicsStep, useBeforePhysicsStep, useRapier } from "@react-three/rapier";
import { ECS } from "@/ecs/world";
import { isDebug } from "@/util/debug";
import { postStep, releaseAllBodies, syncNearBodies } from "./physicsProxy";
import { state } from "./state";
import { trafficRenderQuery } from "./traffic.components";
import { TrafficDebug } from "./TrafficDebug";

const camFwd = new THREE.Vector3();

export function TrafficView() {
  const rapier = useRapier();
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    state.enabled = true;
    return () => {
      state.enabled = false;
      releaseAllBodies(rapier.world);
    };
  }, [rapier]);

  // Camera → view snapshot (used by spawn's off-screen test + LOD distance).
  useFrame(() => {
    const v = state.view;
    v.camX = camera.position.x;
    v.camY = camera.position.y;
    v.camZ = camera.position.z;
    camera.getWorldDirection(camFwd);
    const len = Math.hypot(camFwd.x, camFwd.z) || 1;
    v.fwdX = camFwd.x / len;
    v.fwdZ = camFwd.z / len;
    v.hasCamera = true;
    state.frame++;
  });

  useBeforePhysicsStep(() => {
    if (state.graph) syncNearBodies(rapier);
  });
  useAfterPhysicsStep(() => {
    if (state.graph) postStep(rapier);
  });

  return (
    <>
      <ECS.Entities in={trafficRenderQuery}>
        {(e) => <primitive object={e.three} />}
      </ECS.Entities>
      {isDebug() && <TrafficDebug />}
    </>
  );
}
