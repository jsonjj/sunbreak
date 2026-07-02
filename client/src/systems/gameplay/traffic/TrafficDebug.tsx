// Dev-only lane-graph overlay (draws lane centrelines). Toggled by the `?debug` URL flag via the
// bridge. Built imperatively once the lane graph exists.
import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { state } from "./state";

export function TrafficDebug() {
  const ref = useRef<THREE.LineSegments>(null);
  const built = useRef(false);

  useFrame(() => {
    if (built.current || !state.graph || !ref.current) return;
    const pos: number[] = [];
    for (const lane of state.graph.lanes) {
      const p = lane.points;
      for (let i = 0; i < p.length - 3; i += 3) {
        pos.push(p[i]!, p[i + 1]! + 0.06, p[i + 2]!, p[i + 3]!, p[i + 4]! + 0.06, p[i + 5]!);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    ref.current.geometry.dispose();
    ref.current.geometry = geo;
    built.current = true;
  });

  return (
    <lineSegments ref={ref} frustumCulled={false}>
      <bufferGeometry />
      <lineBasicMaterial color="#39d0ff" transparent opacity={0.5} />
    </lineSegments>
  );
}
