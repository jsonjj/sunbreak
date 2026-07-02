// Dumb per-unit visual. Reads the ECS entity every frame (position + facing) and mutates a
// group ref — no React state, no re-renders. Cruisers/unmarked/SRT render as low-poly cars with
// a blinking siren light-bar; foot units render as an officer capsule. All logic lives in the
// systems; this component only draws what the sim decided.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { Agency, UnitArchetype } from "../types";

const BODY_COLOR: Record<Agency, string> = {
  SVPD: "#eef2f8",
  VSP: "#2b3040",
  SRT: "#15171d",
};

function carDims(archetype: UnitArchetype): { w: number; h: number; l: number } {
  if (archetype === "srtVan") return { w: 2.2, h: 1.8, l: 5.4 };
  return { w: 2.0, h: 1.15, l: 4.6 };
}

export function PoliceUnit({ entity }: { entity: ClientEntity }) {
  const ref = useRef<THREE.Group>(null);
  const redRef = useRef<THREE.MeshStandardMaterial>(null);
  const blueRef = useRef<THREE.MeshStandardMaterial>(null);

  const police = entity.wanted_police;
  const archetype: UnitArchetype = police?.archetype ?? "cruiser";
  const agency: Agency = police?.agency ?? "SVPD";
  const foot = archetype === "foot";
  const body = BODY_COLOR[agency];
  const dims = carDims(archetype);

  useFrame((state) => {
    const g = ref.current;
    const t = entity.transform;
    if (!g || !t) return;
    g.position.set(t.position.x, t.position.y, t.position.z);
    g.rotation.y = entity.movement?.facing ?? 0;

    // Alternating red/blue siren blink (~6 Hz), brighter while actively pursuing.
    const active = police?.fsm === "PURSUE";
    const phase = Math.sin(state.clock.elapsedTime * 18) > 0;
    const hi = active ? 5 : 2.2;
    const lo = 0.15;
    if (redRef.current) redRef.current.emissiveIntensity = phase ? hi : lo;
    if (blueRef.current) blueRef.current.emissiveIntensity = phase ? lo : hi;
  });

  if (foot) {
    return (
      <group ref={ref}>
        <mesh castShadow position={[0, 0.9, 0]}>
          <capsuleGeometry args={[0.3, 0.9, 6, 12]} />
          <meshStandardMaterial color={body} roughness={0.7} />
        </mesh>
        <mesh castShadow position={[0, 1.62, 0]}>
          <sphereGeometry args={[0.22, 12, 12]} />
          <meshStandardMaterial color="#d9b48a" roughness={0.6} />
        </mesh>
        {/* hi-vis shoulder flashes double as tiny siren analogues */}
        <mesh position={[-0.18, 1.2, 0.28]}>
          <boxGeometry args={[0.12, 0.12, 0.05]} />
          <meshStandardMaterial ref={redRef} color="#ff2a2a" emissive="#ff2a2a" emissiveIntensity={2} />
        </mesh>
        <mesh position={[0.18, 1.2, 0.28]}>
          <boxGeometry args={[0.12, 0.12, 0.05]} />
          <meshStandardMaterial ref={blueRef} color="#2a6bff" emissive="#2a6bff" emissiveIntensity={2} />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={ref}>
      {/* body */}
      <mesh castShadow position={[0, dims.h * 0.5 + 0.1, 0]}>
        <boxGeometry args={[dims.w, dims.h, dims.l]} />
        <meshStandardMaterial color={body} roughness={0.45} metalness={0.15} />
      </mesh>
      {/* cabin */}
      <mesh castShadow position={[0, dims.h + 0.15, -0.2]}>
        <boxGeometry args={[dims.w * 0.85, dims.h * 0.6, dims.l * 0.42]} />
        <meshStandardMaterial color="#10131a" roughness={0.3} metalness={0.2} />
      </mesh>
      {/* contrast door stripe */}
      <mesh position={[dims.w * 0.5 + 0.001, dims.h * 0.5 + 0.1, 0]}>
        <boxGeometry args={[0.02, dims.h * 0.5, dims.l * 0.7]} />
        <meshStandardMaterial color={agency === "SVPD" ? "#1b2a55" : "#c8ccd6"} roughness={0.5} />
      </mesh>
      <mesh position={[-(dims.w * 0.5 + 0.001), dims.h * 0.5 + 0.1, 0]}>
        <boxGeometry args={[0.02, dims.h * 0.5, dims.l * 0.7]} />
        <meshStandardMaterial color={agency === "SVPD" ? "#1b2a55" : "#c8ccd6"} roughness={0.5} />
      </mesh>
      {/* light bar */}
      <mesh position={[-0.35, dims.h + 0.5, -0.2]}>
        <boxGeometry args={[0.5, 0.14, 0.34]} />
        <meshStandardMaterial ref={redRef} color="#ff2a2a" emissive="#ff2a2a" emissiveIntensity={2} />
      </mesh>
      <mesh position={[0.35, dims.h + 0.5, -0.2]}>
        <boxGeometry args={[0.5, 0.14, 0.34]} />
        <meshStandardMaterial ref={blueRef} color="#2a6bff" emissive="#2a6bff" emissiveIntensity={2} />
      </mesh>
      {/* wheels */}
      {[
        [-dims.w * 0.5, 0.35, dims.l * 0.32],
        [dims.w * 0.5, 0.35, dims.l * 0.32],
        [-dims.w * 0.5, 0.35, -dims.l * 0.32],
        [dims.w * 0.5, 0.35, -dims.l * 0.32],
      ].map((p, i) => (
        <mesh key={i} castShadow position={[p[0]!, p[1]!, p[2]!]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.35, 0.35, 0.25, 14]} />
          <meshStandardMaterial color="#0a0b0f" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}
