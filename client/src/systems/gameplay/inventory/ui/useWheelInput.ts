// Pointer-angle -> hovered slot while the wheel is open. Mounted only by the open wheel, so it
// costs nothing when closed. Cycling (scroll) and commit (release) are handled elsewhere.

import { useEffect } from "react";
import { useInventoryStore } from "../store";
import { WHEEL_R_INNER, WHEEL_VIEWBOX, angleToSlot, wheelPixelSize } from "./geometry";

export function useWheelInput(): void {
  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const deadzone = wheelPixelSize() * (WHEEL_R_INNER / WHEEL_VIEWBOX);
      const slot = angleToSlot(dx, dy, dist, deadzone);
      const cur = useInventoryStore.getState().hoverSlot;
      if (slot !== cur) useInventoryStore.getState().setHover(slot);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
}
