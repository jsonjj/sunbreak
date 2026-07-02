// "Hold to confirm" affordance (respawn / post bail / skip). Supports pointer hold and
// key hold; reports 0..1 progress for a ring/bar and fires once on completion.
import { useCallback, useEffect, useRef, useState } from "react";

export interface HoldActionOptions {
  durationMs?: number;
  onComplete: () => void;
  keys?: string[];
  enabled?: boolean;
}

export function useHoldAction({
  durationMs = 1100,
  onComplete,
  keys = [" "],
  enabled = true,
}: HoldActionOptions) {
  const [progress, setProgress] = useState(0);
  const cbRef = useRef(onComplete);
  cbRef.current = onComplete;
  const keysRef = useRef(keys);
  keysRef.current = keys;

  const raf = useRef(0);
  const startT = useRef(0);
  const holding = useRef(false);
  const done = useRef(false);

  const begin = useCallback(() => {
    if (!enabled || holding.current || done.current) return;
    holding.current = true;
    startT.current = performance.now();
    const tick = (t: number) => {
      if (!holding.current) return;
      const p = Math.min(1, (t - startT.current) / durationMs);
      setProgress(p);
      if (p >= 1) {
        done.current = true;
        holding.current = false;
        cbRef.current();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [durationMs, enabled]);

  const stop = useCallback(() => {
    holding.current = false;
    cancelAnimationFrame(raf.current);
    if (!done.current) setProgress(0);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const kd = (e: KeyboardEvent) => {
      if (keysRef.current.includes(e.key) && !e.repeat) {
        e.preventDefault();
        begin();
      }
    };
    const ku = (e: KeyboardEvent) => {
      if (keysRef.current.includes(e.key)) stop();
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [begin, stop, enabled]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return { progress, begin, stop };
}
