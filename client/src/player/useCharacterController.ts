import { useEffect, useRef } from "react";
import { useRapier } from "@react-three/rapier";
import {
  CC_AUTOSTEP,
  CC_MAX_SLOPE_CLIMB_DEG,
  CC_MIN_SLOPE_SLIDE_DEG,
  CC_SNAP_TO_GROUND,
  DEG2RAD,
  PLAYER_CAPSULE,
} from "@sunbreak/shared";

type CharacterController = ReturnType<
  ReturnType<typeof useRapier>["world"]["createCharacterController"]
>;

/** Creates + configures one Rapier kinematic character controller; cleans up on unmount. */
export function useCharacterController() {
  const { world } = useRapier();
  const ref = useRef<CharacterController | null>(null);

  useEffect(() => {
    const cc = world.createCharacterController(PLAYER_CAPSULE.offset);
    cc.enableAutostep(CC_AUTOSTEP.maxHeight, CC_AUTOSTEP.minWidth, CC_AUTOSTEP.includeDynamic);
    cc.enableSnapToGround(CC_SNAP_TO_GROUND);
    cc.setMaxSlopeClimbAngle(CC_MAX_SLOPE_CLIMB_DEG * DEG2RAD);
    cc.setMinSlopeSlideAngle(CC_MIN_SLOPE_SLIDE_DEG * DEG2RAD);
    cc.setApplyImpulsesToDynamicBodies(true);
    cc.setSlideEnabled(true);
    ref.current = cc;
    return () => {
      world.removeCharacterController(cc);
      ref.current = null;
    };
  }, [world]);

  return ref;
}
