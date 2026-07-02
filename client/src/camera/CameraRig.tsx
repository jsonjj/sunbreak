import { useRef } from "react";
import * as THREE from "three";
import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { damp3 } from "maath/easing";
import { input } from "../input/InputManager";
import { playerHandle } from "../player/playerHandle";
import { world as ecsWorld } from "../ecs/world";
import { THIRD_PERSON as P } from "./cameraConfig";

const anchor = new THREE.Vector3();
const ideal = new THREE.Vector3();
const dir = new THREE.Vector3();
const sph = new THREE.Spherical();
const HALF_PI = Math.PI / 2;

// Reused ECS queries for the seated-camera seam (vehicle-gameplay owns `vg_occupant`; physics
// owns `veh_isVehicle` + the chassis `rigidBody`). Reading them is order-independent.
const localPlayerQ = ecsWorld.with("isLocal");
const vehicleQ = ecsWorld.with("veh_isVehicle", "transform");

/** Third-person follow camera: spherical boom driven by mouse look, SmoothDamped, with a
 *  Rapier raycast spring-arm that pulls in when geometry blocks the view. Follows the driven
 *  vehicle while the player is seated, otherwise the on-foot player body. */
export function CameraRig() {
  const camRef = useRef<THREE.PerspectiveCamera>(null);
  const { world, rapier } = useRapier();
  const distRef = useRef(P.distance);
  const rayRef = useRef<InstanceType<typeof rapier.Ray> | null>(null);

  useFrame((_, dt) => {
    const cam = camRef.current;
    if (!cam) return;

    // Choose the follow target + the body to exclude from the spring-arm ray.
    const player = localPlayerQ.entities[0];
    const occ = player?.vg_occupant;
    let excludeBody = playerHandle.body ?? undefined;
    let ax: number, ay: number, az: number;
    if (occ) {
      const v = vehicleQ.entities.find((e) => e.netId === occ.vehicleNetId);
      const vb = v?.rigidBody;
      if (vb) {
        const t = vb.translation();
        ax = t.x;
        ay = t.y;
        az = t.z;
        excludeBody = vb;
      } else if (v?.transform) {
        ax = v.transform.position.x;
        ay = v.transform.position.y;
        az = v.transform.position.z;
      } else {
        const body = playerHandle.body;
        if (!body) return;
        const t = body.translation();
        ax = t.x;
        ay = t.y;
        az = t.z;
      }
    } else {
      const body = playerHandle.body;
      if (!body) return;
      const t = body.translation();
      ax = t.x;
      ay = t.y;
      az = t.z;
    }

    anchor.set(ax, ay + P.height, az);

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
    const hit = world.castRay(ray, maxLen, true, undefined, undefined, undefined, excludeBody);
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
