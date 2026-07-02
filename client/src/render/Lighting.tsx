import { Sky } from "@react-three/drei";
import { useQuality } from "./quality/useQuality";

/** Sky + IBL-ish fill + one shadow-casting sun. Procedural sky keeps v0 fully offline (no
 *  HDRI download); the rendering subsystem swaps in CC0 HDRI <Environment> + day/night later. */
export function Lighting() {
  const shadowMap = useQuality((s) => s.settings.shadowMap);

  return (
    <>
      <color attach="background" args={["#bcd3e8"]} />
      <fog attach="fog" args={["#c3d6e6", 45, 280]} />
      <Sky sunPosition={[60, 30, 40]} turbidity={6} rayleigh={1.2} mieCoefficient={0.005} mieDirectionalG={0.8} />
      <hemisphereLight args={["#bcd6ff", "#5a5040", 0.5]} />
      <directionalLight
        castShadow
        position={[60, 90, 40]}
        intensity={2.4}
        shadow-mapSize={[shadowMap, shadowMap]}
        shadow-bias={-0.0001}
        shadow-normalBias={0.04}
        shadow-camera-near={1}
        shadow-camera-far={400}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
      />
    </>
  );
}
