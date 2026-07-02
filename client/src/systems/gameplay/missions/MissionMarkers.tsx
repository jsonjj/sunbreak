// OPTIONAL 3D world markers. Per the WAVE-2 protocol this subsystem does NOT hand-mount into the
// scene; instead it exports this component so the integrator (or the render/map bridge) can drop
// <MissionMarkers /> under the R3F <Canvas>. Missions are fully functional without it — the
// minimap blips (see bridges/blips.ts) are the primary marker surface.

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useMissionStore, type MissionMarker } from "./store";

function Beacon({ marker }: { marker: MissionMarker }) {
  const beamRef = useRef<THREE.Mesh>(null);
  const color = marker.color ?? (marker.waypoint ? "#49e0a8" : "#ffb038");

  useFrame((state) => {
    const beam = beamRef.current;
    if (!beam) return;
    const t = state.clock.elapsedTime;
    beam.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
    const mat = beam.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 1.3 + Math.sin(t * 3) * 0.6;
  });

  return (
    <group position={[marker.position[0], marker.position[1], marker.position[2]]}>
      <mesh ref={beamRef} position={[0, 2, 0]}>
        <cylinderGeometry args={[0.32, 0.55, 4, 20, 1, true]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.4}
          transparent
          opacity={0.45}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {marker.label ? (
        <Html position={[0, 4.7, 0]} center distanceFactor={14} wrapperClass="mission-marker-label">
          <div
            style={{
              padding: "2px 8px",
              borderRadius: 6,
              font: "600 12px/1.2 Inter, system-ui, sans-serif",
              color: "#0b0d12",
              background: color,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
            }}
          >
            {marker.label}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

export function MissionMarkers() {
  const markers = useMissionStore((s) => s.markers);
  return (
    <>
      {markers.map((m) => (
        <Beacon key={m.id} marker={m} />
      ))}
    </>
  );
}
