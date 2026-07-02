// Optional world-space billboard over the focused interactable (drei <Html>). Rendered only for
// the single focused object and only while something is focused — never one per interactable.
// Position follows the focused entity each frame via a ref (no React churn); the label re-renders
// only when the prompt changes.

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useInteractionStore } from "./store";
import { entityPosition, getFocusedEntity } from "./runtime";

const pos = new THREE.Vector3();

export function WorldPromptMarker({ yOffset = 1.7 }: { yOffset?: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const prompt = useInteractionStore((s) => s.prompt);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const entity = getFocusedEntity();
    if (entity && entityPosition(entity, pos)) {
      group.visible = true;
      group.position.set(pos.x, pos.y + yOffset, pos.z);
    } else {
      group.visible = false;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {prompt && (
        <Html center distanceFactor={9} zIndexRange={[20, 0]} pointerEvents="none">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 8px",
              borderRadius: 9,
              whiteSpace: "nowrap",
              fontFamily:
                "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
              fontSize: 12,
              fontWeight: 600,
              color: "#f2f4fa",
              background: "rgba(12,14,20,0.66)",
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
              backdropFilter: "blur(6px)",
              transform: "translateY(-4px)",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 18,
                height: 18,
                padding: "0 4px",
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 800,
                color: "#141821",
                background: "linear-gradient(180deg,#ffd8a1,#ffb454)",
              }}
            >
              {prompt.key}
            </span>
            {prompt.verb}
          </div>
        </Html>
      )}
    </group>
  );
}
