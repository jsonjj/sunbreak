import { useLayoutEffect, useRef } from "react";
import type { HudStoreState } from "@sunbreak/shared";
import { useHudStore } from "./stores";

/**
 * Subscribe to a slice of the HUD store and push it straight to the DOM (a ref mutator),
 * bypassing React entirely. This is the primary per-frame HUD path — health/armor/ammo/
 * speed change ~10 Hz without ever causing a React commit.
 *
 * Selector + apply are captured in refs, so the subscription is created once and never
 * re-subscribes on re-render.
 */
export function useHudTransient<T>(
  selector: (s: HudStoreState) => T,
  apply: (value: T) => void,
): void {
  const selRef = useRef(selector);
  selRef.current = selector;
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useLayoutEffect(() => {
    return useHudStore.subscribe(
      (s) => selRef.current(s),
      (v) => applyRef.current(v),
      { fireImmediately: true },
    );
  }, []);
}
