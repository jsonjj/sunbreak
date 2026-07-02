// R3F bridge for the wanted subsystem. Mount ONCE inside the <Physics> tree (see index.ts
// wiring notes). It does two things:
//   1. Captures the live Rapier context (via useRapier) into the module singleton so the
//      plain-TS perception system can cast LOS rays. Without it, LOS degrades to FOV+distance.
//   2. Renders every deployed police unit through the ECS↔R3F bridge (<ECS.Entities>), reusing
//      the entity's sim transform — no hand-mounting of fixed scene content.
// The core simulation runs entirely from registered systems, so if this view is never mounted
// the star system + HUD still work; only the police meshes + occlusion LOS are absent.
import { useEffect } from "react";
import { useRapier } from "@react-three/rapier";
import { ECS } from "@/ecs/world";
import { activePoliceQuery } from "../queries";
import { setRapierCtx } from "../rapierBridge";
import { PoliceUnit } from "./PoliceUnit";

export function WantedView() {
  const ctx = useRapier();

  useEffect(() => {
    setRapierCtx(ctx);
    return () => setRapierCtx(null);
  }, [ctx]);

  return (
    <ECS.Entities in={activePoliceQuery}>
      {(entity) => <PoliceUnit entity={entity} />}
    </ECS.Entities>
  );
}
