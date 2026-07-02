// Compact DOM renderer-info readout, fed by the in-canvas PerfBridge via the debug store. Shown
// only in the "full" overlay mode as a complement to the in-canvas <Perf> graph.

import { useDebugStore } from "../store/debugStore";
import { panelStyle, C, MONO } from "./ui";

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 12 }}>
      <span style={{ color: C.dim }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

export function PerfHud() {
  const overlay = useDebugStore((s) => s.overlay);
  const m = useDebugStore((s) => s.metrics);
  if (overlay !== "full") return null;

  return (
    <div style={{ ...panelStyle, right: 12, top: 124, width: 188, padding: "8px 10px" }}>
      <div style={{ color: C.dim, fontSize: 10, letterSpacing: 0.6, marginBottom: 4 }}>RENDERER.INFO</div>
      <Row k="fps" v={m.fps.toFixed(0)} />
      <Row k="ms" v={m.ms.toFixed(2)} />
      <Row k="calls" v={String(m.calls)} />
      <Row k="tris" v={m.triangles.toLocaleString()} />
      <Row k="geo" v={String(m.geometries)} />
      <Row k="tex" v={String(m.textures)} />
      <Row k="prog" v={String(m.programs)} />
      {m.heapMB != null && <Row k="heap" v={`${m.heapMB}MB`} />}
    </div>
  );
}
