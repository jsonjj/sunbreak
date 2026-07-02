import { useFrame } from "@react-three/fiber";
import { registry } from "./registry";
import { world } from "../ecs/world";

/** Runs the non-physics system phases in deterministic order once per frame. Input is sampled
 *  earlier by <InputBinder> (priority -1000); physics phases are driven by Rapier's own hooks. */
export function SystemsRunner() {
  useFrame((_, dt) => {
    registry.run("input", world, dt);
    registry.run("update", world, dt);
    registry.run("render", world, dt);
    registry.run("finish", world, dt);
  }, 100);

  return null;
}
