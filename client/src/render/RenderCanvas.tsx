import { Suspense } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Scene } from "../game/Scene";
import { useQuality } from "./quality/useQuality";

/** Top-level R3F canvas: WebGL2 + ACES filmic tone mapping + sRGB + soft shadows. */
export function RenderCanvas() {
  const dprMax = useQuality((s) => s.settings.dprMax);

  return (
    <Canvas
      shadows="soft"
      dpr={[1, dprMax]}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false, stencil: false }}
      camera={{ fov: 55, near: 0.3, far: 1200, position: [0, 5, 10] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
}
