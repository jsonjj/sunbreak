import { Perf } from "r3f-perf";
import { Lighting } from "../render/Lighting";
import { PhysicsProvider } from "../physics/PhysicsProvider";
import { Environment } from "./Environment";
import { PlayerController } from "../player/PlayerController";
import { CameraRig } from "../camera/CameraRig";
import { SystemsRunner } from "./SystemsRunner";
import { InputBinder } from "../input/InputBinder";
import { isDebug } from "../util/debug";

/** The full v0 scene graph mounted inside the R3F <Canvas>. */
export function Scene() {
  const debug = isDebug();
  return (
    <>
      <Lighting />

      <PhysicsProvider debug={debug}>
        <Environment />
        <PlayerController />
        <CameraRig />
        <SystemsRunner />
      </PhysicsProvider>

      <InputBinder />
      {debug && <Perf position="top-left" />}
    </>
  );
}
