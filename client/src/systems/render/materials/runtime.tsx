// Optional R3F helper. The per-frame uniform bus already runs via the central SystemsRunner, so
// this is ONLY needed to enable real KTX2 loading: it hands the WebGLRenderer to the KTX2 singleton
// (detectSupport) once. Mount it once anywhere inside the <Canvas> (integrator's choice) — nothing
// breaks if it's never mounted, since materials fall back to procedural maps.
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { setMaterialsRenderer } from "./textures/ktx2";

export function MaterialsRuntime(): null {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    setMaterialsRenderer(gl);
  }, [gl]);
  return null;
}
