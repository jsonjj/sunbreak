import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { input } from "./InputManager";

/** Mounts DOM listeners on the canvas and refreshes the per-frame input snapshot first. */
export function InputBinder() {
  const domElement = useThree((s) => s.gl.domElement);

  useEffect(() => {
    input.attach(domElement);
    return () => input.detach();
  }, [domElement]);

  // Earliest priority so the snapshot is fresh before gameplay systems read it.
  useFrame(() => {
    input.sample();
  }, -1000);

  return null;
}
