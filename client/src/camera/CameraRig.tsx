import { useRef } from "react";
import * as THREE from "three";
import { PerspectiveCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { damp3 } from "maath/easing";
import { InputAction } from "@sunbreak/shared";
import { input } from "../input/InputManager";
import { playerHandle } from "../player/playerHandle";
import { world as ecsWorld } from "../ecs/world";
import { THIRD_PERSON, AIM, FIRST_PERSON } from "./cameraConfig";

const anchor = new THREE.Vector3();
const ideal = new THREE.Vector3();
const dir = new THREE.Vector3();
const look = new THREE.Vector3();
const sph = new THREE.Spherical();
const HALF_PI = Math.PI / 2;

// Reused ECS queries for the seated-camera seam (vehicle-gameplay owns `vg_occupant`; physics
// owns `veh_isVehicle` + the chassis `rigidBody`). Reading them is order-independent.
const localPlayerQ = ecsWorld.with("isLocal");
const vehicleQ = ecsWorld.with("veh_isVehicle", "transform");

/** Third-person follow camera with an over-the-shoulder AIM profile (hold RMB) and a FIRST-PERSON
 *  toggle (V, on foot). A spherical boom driven by mouse look, SmoothDamped, with a Rapier raycast
 *  spring-arm that pulls in when geometry blocks the view. Follows the driven vehicle while seated,
 *  otherwise the on-foot player body. Non-inverted look is owned by InputManager (pitch += …). */
export function CameraRig() {
  const camRef = useRef<THREE.PerspectiveCamera>(null);
  const { world, rapier } = useRapier();
  const distRef = useRef(THIRD_PERSON.distance);
  const rayRef = useRef<InstanceType<typeof rapier.Ray> | null>(null);
  const fpRef = useRef(false); // first-person latched on/off
  const prevFpKey = useRef(false);

  useFrame((_, dt) => {
    const cam = camRef.current;
    if (!cam) return;

    const player = localPlayerQ.entities[0];
    const occ = player?.vg_occupant;

    // First-person toggle (edge-detected; on foot only — vehicles always use the chase cam).
    const fpKey = input.isActionDown(InputAction.FirstPerson);
    if (fpKey && !prevFpKey.current) fpRef.current = !fpRef.current;
    prevFpKey.current = fpKey;
    const firstPerson = fpRef.current && !occ;
    const aiming = !firstPerson && !occ && input.isActionDown(InputAction.Aim);
    const P = firstPerson ? FIRST_PERSON : aiming ? AIM : THIRD_PERSON;

    // Choose the follow target + the body to exclude from the spring-arm ray.
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

    // Ease the FOV toward the active profile (aim zooms in, first-person widens).
    if (Math.abs(cam.fov - P.fov) > 0.01) {
      cam.fov = THREE.MathUtils.damp(cam.fov, P.fov, 12, dt);
      cam.updateProjectionMatrix();
    }

    const yaw = input.yaw;
    const pitch = input.pitch;
    // Horizontal "right" vector for the over-the-shoulder offset (0 unless aiming).
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    anchor.set(ax + rx * P.shoulder, ay + P.height, az + rz * P.shoulder);

    // ── First person: eye-mounted, no boom. The 0.3 near-plane clips the player's own head. ──
    if (firstPerson) {
      damp3(cam.position, anchor, P.smoothTime, dt);
      const cp = Math.cos(pitch);
      look.set(
        anchor.x - Math.sin(yaw) * cp,
        anchor.y - Math.sin(pitch),
        anchor.z - Math.cos(yaw) * cp,
      );
      cam.lookAt(look);
      distRef.current = 0;
      return;
    }

    // ── Third person / aim: spherical boom + collision spring-arm. ──
    sph.set(P.distance, HALF_PI - pitch, yaw);
    ideal.setFromSpherical(sph).add(anchor);
    dir.copy(ideal).sub(anchor);
    const maxLen = dir.length() || P.distance;
    dir.normalize();

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
    <PerspectiveCamera ref={camRef} makeDefault fov={THIRD_PERSON.fov} near={0.3} far={1200} position={[0, 5, 10]} />
  );
}
