// The in-Canvas consumer. Mount ONCE inside <Physics> (it needs useRapier). Each frame it feeds
// the camera viewpoint (position + forward) to the focus loop so scoring can use facing alignment
// and line-of-sight, and it hands the live Rapier context to handlers. Optionally renders the
// world-space prompt marker (gate behind a settings flag).

import { useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { clearViewpoint, setRapier, setViewpoint } from "./runtime";
import { WorldPromptMarker } from "./WorldPromptMarker";

const forward = new THREE.Vector3();

export function InteractionRig({ marker = false }: { marker?: boolean }) {
  const rapier = useRapier();

  useEffect(() => {
    setRapier(rapier);
    return () => {
      setRapier(null);
      clearViewpoint();
    };
  }, [rapier]);

  useFrame((state) => {
    const cam = state.camera;
    cam.getWorldDirection(forward);
    setViewpoint(cam.position.x, cam.position.y, cam.position.z, forward.x, forward.y, forward.z);
  });

  return marker ? <WorldPromptMarker /> : null;
}
