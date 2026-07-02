import { useFrame } from "@react-three/fiber";
import { registry } from "./registry";
import { world } from "../ecs/world";

/** Runs the non-physics system phases in deterministic order once per frame. Input is sampled
 *  earlier by <InputBinder> (priority -1000); physics phases are driven by Rapier's own hooks.
 *
 *  IMPORTANT: renderPriority MUST be <= 0. In R3F, any useFrame with a POSITIVE renderPriority
 *  flips the canvas into manual-render mode and disables the automatic gl.render() — which
 *  leaves the viewport black even though the scene, lights and camera are all mounted. We run
 *  at 0 (after the -1000 input sample) and let R3F auto-render after all subscribers. */
export function SystemsRunner() {
  useFrame((_, dt) => {
    registry.run("input", world, dt);
    registry.run("update", world, dt);
    registry.run("render", world, dt);
    registry.run("finish", world, dt);
  }, 0);

  return null;
}
