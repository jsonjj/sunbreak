import { useRef } from "react";

/**
 * Returns a value that never decreases — used to defeat drei `useProgress`'s per-phase
 * 0->100->0 reset flicker. Pass a `reset` key (e.g. a load-session id) that changes when a new
 * load genuinely starts, so the clamp can drop back for the next session.
 */
export function useMonotonic(value: number, reset?: unknown): number {
  const ref = useRef(value);
  const resetRef = useRef(reset);
  if (reset !== resetRef.current) {
    resetRef.current = reset;
    ref.current = value;
  }
  if (value > ref.current) ref.current = value;
  return ref.current;
}
