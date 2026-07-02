// Pointer-angle -> hovered owned segment while the wheel is open. Mounted only by the open wheel,
// so it costs nothing when closed. The hovered segment's category `slot` is written to the store
// (`setHover`) so it shares state with scroll-cycle + release-commit; commit + scroll are handled
// elsewhere (WeaponWheel click / inventory input.ts).

import { useEffect, useRef } from "react";
import { useInventoryStore } from "../store";
import { pointerToIndex } from "./geometry";
import type { WheelEntry } from "./layout";

export function useWheelInput(entries: WheelEntry[]): void {
  // Keep the latest layout in a ref so the single window listener never goes stale as the owned
  // set / count changes, without re-subscribing on every pointer move.
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      const list = entriesRef.current;
      const idx = pointerToIndex(e.clientX, e.clientY, list.length);
      const hit = idx >= 0 ? list[idx] : undefined;
      const slot = hit ? hit.slot : -1;
      if (slot !== useInventoryStore.getState().hoverSlot) {
        useInventoryStore.getState().setHover(slot);
      }
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
}
