// World-space ped HEALTH BARS — a small pool of camera-facing billboards drawn above nearby peds
// that are DAMAGED or actively FIGHTING (hidden at full health / when calm). Peds are instanced with
// no per-entity object, so we can't parent a bar to each; instead we pool a fixed set of bars and
// bind them to the nearest relevant peds every frame (the same pattern as the ped colliders pool).
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { getPlayer, pedQuery } from "../queries";

const POOL = 24; // max bars on screen at once
const SHOW_R = 42; // only bars within this radius of the player
const SHOW_R2 = SHOW_R * SHOW_R;
const BAR_W = 0.9;
const BAR_H = 0.12;
const HEAD_OFFSET = 1.15; // above the ped's transform (body centre)

export function PedHealthBars() {
  const { camera } = useThree();
  const groups = useRef<(THREE.Group | null)[]>([]);
  const fills = useRef<(THREE.Mesh | null)[]>([]);

  const bgMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#0b0e14", transparent: true, opacity: 0.6, depthTest: false, depthWrite: false }),
    [],
  );
  const fillMats = useMemo(
    () =>
      Array.from(
        { length: POOL },
        () => new THREE.MeshBasicMaterial({ color: "#49e0a8", transparent: true, depthTest: false, depthWrite: false }),
      ),
    [],
  );

  useFrame(() => {
    const pp = getPlayer()?.transform?.position;
    let n = 0;
    for (const e of pedQuery) {
      if (n >= POOL) break;
      const a = e.ped_agent!;
      if (a.state === "dead") continue;
      const hp = e.stat_health;
      if (!hp) continue;
      const damaged = hp.current < hp.max;
      const fighting = a.state === "fight";
      if (!damaged && !fighting) continue;
      const t = e.transform!;
      if (pp) {
        const dx = t.position.x - pp.x;
        const dz = t.position.z - pp.z;
        if (dx * dx + dz * dz > SHOW_R2) continue;
      }
      const g = groups.current[n];
      const fill = fills.current[n];
      const mat = fillMats[n];
      if (!g || !fill || !mat) {
        n++;
        continue;
      }
      g.visible = true;
      g.position.set(t.position.x, t.position.y + HEAD_OFFSET, t.position.z);
      g.quaternion.copy(camera.quaternion); // billboard toward the camera
      const frac = Math.max(0, Math.min(1, hp.current / hp.max));
      fill.scale.x = Math.max(0.001, frac);
      fill.position.x = -(BAR_W * (1 - frac)) / 2;
      mat.color.setStyle(frac > 0.5 ? "#49e0a8" : frac > 0.25 ? "#e8c07a" : "#e5484d");
      n++;
    }
    for (let i = n; i < POOL; i++) {
      const g = groups.current[i];
      if (g && g.visible) g.visible = false;
    }
  });

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g;
          }}
          visible={false}
          renderOrder={998}
        >
          <mesh renderOrder={998} material={bgMat}>
            <planeGeometry args={[BAR_W + 0.05, BAR_H + 0.05]} />
          </mesh>
          <mesh
            ref={(m) => {
              fills.current[i] = m;
            }}
            position={[0, 0, 0.002]}
            renderOrder={999}
            material={fillMats[i]}
          >
            <planeGeometry args={[BAR_W, BAR_H]} />
          </mesh>
        </group>
      ))}
    </>
  );
}
