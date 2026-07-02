// OPTIONAL camera-driven listener. The engine already drives the listener from ECS
// (listenerSystem) with zero wiring, so this is only for integrators who want the listener to
// track the actual render camera (e.g. cinematic cameras) rather than the player entity. Mount it
// once INSIDE the R3F <Canvas>; while mounted it takes over and the ECS listener system stands
// down. NOT auto-mounted — the engine must not hand-mount into the v0 App/Scene.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { setCameraListenerActive, setListener } from "../spatial/listener";

const pos = new THREE.Vector3();
const dir = new THREE.Vector3();
const up = new THREE.Vector3();

export interface AudioListenerRigProps {
  /** Update frequency cap (Hz). */
  hz?: number;
}

export function AudioListenerRig({ hz = 60 }: AudioListenerRigProps): null {
  const camera = useThree((s) => s.camera);
  const acc = useRef(0);

  useEffect(() => {
    setCameraListenerActive(true);
    return () => setCameraListenerActive(false);
  }, []);

  useFrame((_, dt) => {
    acc.current += dt;
    const rate = 1 / hz;
    if (acc.current < rate) return;
    acc.current = 0;
    camera.getWorldPosition(pos);
    camera.getWorldDirection(dir);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    setListener(pos.x, pos.y, pos.z, dir.x, dir.y, dir.z, up.x, up.y, up.z);
  });

  return null;
}
