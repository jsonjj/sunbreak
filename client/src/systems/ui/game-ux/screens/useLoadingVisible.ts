// Decides whether the loading screen should be mounted: true while drei is actively loading
// assets (boot / streaming) OR a scripted `loading:begin/end` transition is in flight, with a
// minimum display time so very fast loads don't flash.
import { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { useUxStore } from "../state/uiStore";

export function useLoadingVisible(minMs = 700): boolean {
  const active = useProgress((s) => s.active);
  const scripted = useUxStore((s) => s.scriptedLoading);
  const wantVisible = active || scripted;

  const [visible, setVisible] = useState(wantVisible);
  const shownAt = useRef<number>(wantVisible ? Date.now() : 0);

  useEffect(() => {
    if (wantVisible) {
      if (!visible) {
        shownAt.current = Date.now();
        setVisible(true);
      }
      return;
    }
    const elapsed = Date.now() - shownAt.current;
    const wait = Math.max(0, minMs - elapsed);
    const t = setTimeout(() => setVisible(false), wait);
    return () => clearTimeout(t);
  }, [wantVisible, visible, minMs]);

  return visible;
}
