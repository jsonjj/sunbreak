// <CombatRig/> — the ONE mountable piece of combat. INTEGRATOR: render this once inside the
// physics root (e.g. in `client/src/game/Scene.tsx`, inside <PhysicsProvider>). See the report's
// "integrator wiring notes". It does three things:
//   1. Publishes the Rapier world/namespace + the active camera into `combatRuntime` so the
//      registry-driven fire/projectile systems can raycast + aim (they run outside React context).
//   2. Renders combat's own pooled weapon VFX (tracers / muzzle flash / impacts) + projectiles.
//   3. Spawns a small self-contained practice range so the whole pipeline is verifiable solo.
//
// Combat's gameplay LOGIC self-registers via `index.ts` and runs without this; mounting it adds
// world-geometry occlusion, on-screen VFX, and the practice targets.

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { combatRuntime } from "../runtime";
import {
  PROJECTILE_CAP,
  RANGE_ANCHOR,
  RANGE_SPACING,
  TARGET_COUNT,
  TARGET_HEALTH,
} from "../constants";
import { buildVfxPools, updateVfxPools } from "./vfxPools";

interface TargetView {
  e: ClientEntity;
  mesh: THREE.Mesh;
}

export function CombatRig({ practiceTargets = true }: { practiceTargets?: boolean } = {}) {
  const { world: rWorld, rapier } = useRapier();
  const camera = useThree((s) => s.camera);

  const pools = useMemo(() => buildVfxPools(), []);
  const projectileView = useMemo(() => buildProjectilePool(), []);
  const targetsGroup = useMemo(() => new THREE.Group(), []);
  const targetsRef = useRef<TargetView[]>([]);
  const projQuery = useMemo(() => world.with("combat_projectile", "transform"), []);

  // 1a. Publish Rapier handles to the registry systems.
  useEffect(() => {
    combatRuntime.world = rWorld;
    combatRuntime.rapier = rapier;
    combatRuntime.ready = true;
    return () => {
      combatRuntime.world = null;
      combatRuntime.rapier = null;
      combatRuntime.ready = false;
    };
  }, [rWorld, rapier]);

  // 1b. Publish the active camera (crosshair-accurate aim origin/direction).
  useEffect(() => {
    combatRuntime.camera = camera;
    return () => {
      if (combatRuntime.camera === camera) combatRuntime.camera = null;
    };
  }, [camera]);

  // 2. Dispose pools on unmount.
  useEffect(() => {
    return () => {
      pools.dispose();
      projectileView.dispose();
    };
  }, [pools, projectileView]);

  // 3. Spawn the practice range (combat-owned ECS entities + meshes).
  useEffect(() => {
    if (!practiceTargets) return;
    const created: TargetView[] = [];
    const geo = new THREE.BoxGeometry(0.7, 1.6, 0.28);
    const mat = new THREE.MeshStandardMaterial({ color: "#d7643f", roughness: 0.7, metalness: 0.1 });
    for (let i = 0; i < TARGET_COUNT; i++) {
      const home = {
        x: RANGE_ANCHOR.x + (i - (TARGET_COUNT - 1) / 2) * RANGE_SPACING,
        y: 0.9,
        z: RANGE_ANCHOR.z,
      };
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.position.set(home.x, home.y, home.z);
      targetsGroup.add(mesh);
      const e: ClientEntity = {
        isActive: true,
        transform: { position: { ...home }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
        stat_health: { current: TARGET_HEALTH, max: TARGET_HEALTH, armor: 0 },
        combat_hittable: true,
        combat_target: { respawnAt: 0, home: { ...home } },
        combat_deadAt: 0,
      };
      world.add(e);
      created.push({ e, mesh });
    }
    targetsRef.current = created;
    return () => {
      for (const { e, mesh } of created) {
        targetsGroup.remove(mesh);
        world.remove(e);
      }
      geo.dispose();
      mat.dispose();
      targetsRef.current = [];
    };
  }, [practiceTargets, targetsGroup]);

  useFrame((_, dt) => {
    // Reflect ECS target state (downed = hidden until targetSystem respawns it).
    for (const { e, mesh } of targetsRef.current) {
      const dead = e.isDead === true || (e.combat_deadAt ?? 0) > 0;
      mesh.visible = !dead;
      const t = e.transform;
      if (t) mesh.position.set(t.position.x, t.position.y, t.position.z);
    }

    // Projectiles: map live entities onto pooled meshes.
    const meshes = projectileView.meshes;
    const list = projQuery.entities;
    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i]!;
      const e = list[i];
      if (e && e.transform) {
        m.visible = true;
        m.position.set(e.transform.position.x, e.transform.position.y, e.transform.position.z);
      } else {
        m.visible = false;
      }
    }

    // Weapon VFX.
    updateVfxPools(pools, dt);
  });

  return (
    <>
      <primitive object={pools.group} />
      <primitive object={projectileView.group} />
      <primitive object={targetsGroup} />
    </>
  );
}

function buildProjectilePool(): { group: THREE.Group; meshes: THREE.Mesh[]; dispose: () => void } {
  const group = new THREE.Group();
  group.name = "combat-projectiles";
  const geo = new THREE.SphereGeometry(0.16, 10, 10);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff7043 });
  const meshes: THREE.Mesh[] = [];
  for (let i = 0; i < PROJECTILE_CAP; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    m.frustumCulled = false;
    group.add(m);
    meshes.push(m);
  }
  return {
    group,
    meshes,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}
