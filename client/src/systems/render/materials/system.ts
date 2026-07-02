// Registered systems for the render/materials subsystem (run by the central SystemsRunner — no
// hand-mounting). Two render-phase systems:
//   • materials:uniformBus — pushes weather/time-of-day → globalUniforms once per frame (early).
//   • materials:apply      — binds registry materials to entities tagged with `mat_defId`.
import * as THREE from "three";
import type { System } from "@sunbreak/shared";
import type { ClientEntity } from "@/ecs/clientEntity";
import { world } from "@/ecs/world";
import { MaterialRegistry } from "./MaterialRegistry";
import { updateUniformBus } from "./uniformBus";
import type { MaterialOverrides } from "./types";
import "./mat.components"; // side-effect: load the ECS augmentation

type W = typeof world;

// Entities that want a shared material but haven't received one yet.
const pending = world.with("three", "mat_defId").without("mat_applied");

function overridesFromEntity(e: ClientEntity): MaterialOverrides | undefined {
  const o: MaterialOverrides = {};
  let any = false;
  if (e.mat_puddleFactor !== undefined) {
    o.puddleFactor = e.mat_puddleFactor;
    any = true;
  }
  if (e.mat_porosity !== undefined) {
    o.porosity = e.mat_porosity;
    any = true;
  }
  if (e.mat_emissiveBoost !== undefined) {
    o.emissiveBoost = e.mat_emissiveBoost;
    any = true;
  }
  if (e.mat_tint) {
    o.color = `#${new THREE.Color(e.mat_tint.x, e.mat_tint.y, e.mat_tint.z).getHexString()}`;
    any = true;
  }
  return any ? o : undefined;
}

/** Bind a shared registry material to every mesh under `root`. Exported for imperative callers. */
export function applyMaterialToObject(root: THREE.Object3D, defId: string, overrides?: MaterialOverrides): void {
  const material = MaterialRegistry.get(defId, overrides);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.material = material;
  });
}

export const uniformBusSystem: System<W> = {
  name: "materials:uniformBus",
  phase: "render",
  order: -1000, // run before other render systems so they read fresh uniforms this frame
  fn: (_w, dt) => updateUniformBus(dt),
};

export const applyMaterialsSystem: System<W> = {
  name: "materials:apply",
  phase: "render",
  order: -900,
  fn: () => {
    if (pending.entities.length === 0) return;
    // Snapshot: adding mat_applied removes the entity from this query mid-iteration.
    for (const e of [...pending.entities]) {
      if (!e.three) continue;
      applyMaterialToObject(e.three, e.mat_defId as string, overridesFromEntity(e));
      world.addComponent(e, "mat_applied", true);
    }
  },
};
