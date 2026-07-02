// ECS↔R3F bridge for characters. Mount this ONCE inside the R3F scene graph (integrator wiring —
// see index.ts notes). It reactively mounts/unmounts each character's prebuilt Object3D (the
// `three` view component) as entities enter/leave the world; a render-phase system positions and
// animates them. No hand-mounting into App/Scene from this subsystem.

import "../char.components";
import { ECS, world } from "@/ecs/world";

const renderable = world.with("three", "char_kind");

export function CharacterView() {
  return (
    <ECS.Entities in={renderable}>
      {(entity) => <primitive object={entity.three} />}
    </ECS.Entities>
  );
}
