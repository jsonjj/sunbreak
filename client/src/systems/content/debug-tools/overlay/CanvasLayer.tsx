// In-canvas debug layer (heavy — imports r3f-perf). Loaded lazily by <DebugCanvas> only when the
// debug layer is enabled, so r3f-perf stays out of a normal production bundle.
//
// Mount this INSIDE the R3F <Canvas>. It renders:
//   - <Perf>            FPS / draw-calls / memory overlay (mode from the debug store)
//   - <PerfBridge>      pipes gl.info into the debug store (for the DOM HUD + `perf` command)
//   - <ThreeRefBinder>  exposes gl/scene/camera to DOM-side tools (screenshots, etc.)
//   - debug-spawned entities, via the ECS<->R3F bridge (never hand-mounted)

import { useEffect, useRef } from "react";
import { Perf } from "r3f-perf";
import { useFrame, useThree } from "@react-three/fiber";
import { ECS, world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { useDebugStore } from "../store/debugStore";
import { setThreeRefs } from "../console/context";
import "../debug.components";

const spawnQuery = world.with("dbg_spawned", "transform");

function ThreeRefBinder(): null {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    setThreeRefs({ gl, scene, camera });
    return () => setThreeRefs({ gl: null, scene: null, camera: null });
  }, [gl, scene, camera]);
  return null;
}

/** Samples renderer stats ~4x/sec and pushes them into the debug store (no React churn). */
function PerfBridge(): null {
  const gl = useThree((s) => s.gl);
  const acc = useRef(0);
  const frames = useRef(0);
  useFrame((_, dt) => {
    frames.current += 1;
    acc.current += dt;
    if (acc.current < 0.25) return;
    const info = gl.info;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    useDebugStore.getState().setMetrics({
      fps: frames.current / acc.current,
      ms: (acc.current / frames.current) * 1000,
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
    });
    acc.current = 0;
    frames.current = 0;
  });
  return null;
}

const SPAWN_SIZE: Record<NonNullable<ClientEntity["dbg_kind"]>, [number, number, number]> = {
  car: [2, 1, 4],
  ped: [0.6, 1.7, 0.6],
  prop: [1, 1, 1],
};

/** A placeholder mesh for a debug-spawned entity, positioned from its ECS transform. Click to
 *  select it in the inspector; the selected entity glows. */
function SpawnedProp({ entity }: { entity: ClientEntity }) {
  const ref = useRef<import("three").Mesh>(null);
  const id = world.id(entity);
  const selected = useDebugStore((s) => s.selected != null && s.selected === id);
  const kind = entity.dbg_kind ?? "prop";

  useFrame(() => {
    const m = ref.current;
    const t = entity.transform;
    if (!m || !t) return;
    m.position.set(t.position.x, t.position.y, t.position.z);
  });

  return (
    <mesh
      ref={ref}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        if (id != null) useDebugStore.getState().select(id);
      }}
    >
      <boxGeometry args={SPAWN_SIZE[kind]} />
      <meshStandardMaterial
        color={entity.dbg_color ?? 0xffb454}
        emissive={selected ? 0x3b82f6 : 0x000000}
        emissiveIntensity={selected ? 0.8 : 0}
        roughness={0.5}
        metalness={0.1}
      />
    </mesh>
  );
}

export default function CanvasLayer() {
  const overlay = useDebugStore((s) => s.overlay);
  return (
    <>
      <ThreeRefBinder />
      <PerfBridge />
      {overlay !== "off" && (
        <Perf
          position="top-right"
          minimal={overlay === "minimal"}
          deepAnalyze={overlay === "full"}
        />
      )}
      <ECS.Entities in={spawnQuery}>{(entity) => <SpawnedProp entity={entity} />}</ECS.Entities>
    </>
  );
}
