// Optional mountable renderer for peds. The ped sim runs entirely from the systems registry; this
// component only (a) mounts the InstancedMesh group into the R3F scene and (b) publishes the live
// camera to `viewRef` for LOD + off-screen spawn.
//
// INTEGRATOR: mount <PedInstances/> ONCE inside the R3F <Canvas> tree (e.g. in Scene.tsx). This
// is the recommended wiring if there is no generic ECS↔R3F bridge that already renders each
// entity's `three` view component. Mount EITHER this OR the bridge — not both (the group has a
// single parent). See index.ts + the report's wiring notes.

import { useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { buildRenderRoot } from "./pedInstances";
import { viewRef } from "../queries";

const _fwd = new THREE.Vector3();

export function PedInstances() {
  const root = useMemo(() => buildRenderRoot(), []);
  const camera = useThree((s) => s.camera);

  useFrame(() => {
    viewRef.hasCamera = true;
    viewRef.x = camera.position.x;
    viewRef.y = camera.position.y;
    viewRef.z = camera.position.z;
    camera.getWorldDirection(_fwd);
    const len = Math.hypot(_fwd.x, _fwd.z) || 1;
    viewRef.fwdX = _fwd.x / len;
    viewRef.fwdZ = _fwd.z / len;
  }, 1);

  return <primitive object={root} />;
}

export default PedInstances;
