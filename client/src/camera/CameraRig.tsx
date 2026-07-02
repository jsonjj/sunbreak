import { useRef } from "react";
import * as THREE from "three";
import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { damp3 } from "maath/easing";
import { input } from "../input/InputManager";
import { playerHandle } from "../player/playerHandle";
import { THIRD_PERSON as P } from "./cameraConfig";

const anchor = new THREE.Vector3();
const ideal = new THREE.Vector3();
const dir = new THREE.Vector3();
const sph = new THREE.Spherical();
const HALF_PI = Math.PI / 2;

/** Third-person follow camera: spherical boom driven by mouse look, SmoothDamped, with a
 *  Rapier raycast spring-arm that pulls in when geometry blocks the view. */
export function CameraRig() {
  const camRef = useRef<THREE.PerspectiveCamera>(null);
  const { world, rapier } = useRapier();
  const distRef = useRef(P.distance);
  const rayRef = useRef<InstanceType<typeof rapier.Ray> | null>(null);

  useFrame((_, dt) => {
    const cam = camRef.current;
    const body = playerHandle.body;
    if (!cam || !body) return;

    const t = body.translation();
    anchor.set(t.x, t.y + P.height, t.z);

    // Ideal boom position from yaw/pitch.
    sph.set(P.distance, HALF_PI - input.pitch, input.yaw);
    ideal.setFromSpherical(sph).add(anchor);
    dir.copy(ideal).sub(anchor);
    const maxLen = dir.length() || P.distance;
    dir.normalize();

    // Collision spring-arm (exclude the player's own body).
    if (!rayRef.current) rayRef.current = new rapier.Ray(anchor, dir);
    const ray = rayRef.current;
    ray.origin.x = anchor.x;
    ray.origin.y = anchor.y;
    ray.origin.z = anchor.z;
    ray.dir.x = dir.x;
    ray.dir.y = dir.y;
    ray.dir.z = dir.z;
    const hit = world.castRay(ray, maxLen, true, undefined, undefined, undefined, body);
    const targetDist = hit ? Math.max(0.4, hit.timeOfImpact - 0.2) : P.distance;
    // Fast pull-in, slow ease-out.
    distRef.current = THREE.MathUtils.damp(distRef.current, targetDist, hit ? 25 : 8, dt);

    ideal.copy(dir).multiplyScalar(distRef.current).add(anchor);
    damp3(cam.position, ideal, P.smoothTime, dt);
    cam.lookAt(anchor);
  });

  return (
    <PerspectiveCamera ref={camRef} makeDefault fov={P.fov} near={0.3} far={1200} position={[0, 5, 10]} />
  );
}
