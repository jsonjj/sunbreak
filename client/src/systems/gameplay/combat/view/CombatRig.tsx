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
import { createRoot, type Root } from "react-dom/client";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { getWeapon } from "@/systems/gameplay/inventory";
import { combatRuntime } from "../runtime";
import {
  PROJECTILE_CAP,
  RANGE_ANCHOR,
  RANGE_SPACING,
  TARGET_COUNT,
  TARGET_HEALTH,
} from "../constants";
import { buildVfxPools, updateVfxPools } from "./vfxPools";
import { CombatOverlay } from "./CombatOverlay";

interface TargetView {
  e: ClientEntity;
  mesh: THREE.Mesh;
}

/** A pickup entity as the `combat_weaponPickup` query guarantees it (transform + pickup present). */
type PickupEntity = ClientEntity & Required<Pick<ClientEntity, "combat_weaponPickup" | "transform">>;

export function CombatRig({
  practiceTargets = true,
  hud = true,
}: { practiceTargets?: boolean; hud?: boolean } = {}) {
  const { world: rWorld, rapier } = useRapier();
  const camera = useThree((s) => s.camera);

  const pools = useMemo(() => buildVfxPools(), []);
  const projectileView = useMemo(() => buildProjectilePool(), []);
  const targetsGroup = useMemo(() => new THREE.Group(), []);
  const targetsRef = useRef<TargetView[]>([]);
  const projQuery = useMemo(() => world.with("combat_projectile", "transform"), []);

  // Weapon-pickup rendering (spinning, bobbing, tinted by the weapon accent).
  const pickupsGroup = useMemo(() => new THREE.Group(), []);
  const pickupGeo = useMemo(() => new THREE.IcosahedronGeometry(0.26, 0), []);
  const pickupQuery = useMemo(() => world.with("combat_weaponPickup", "transform"), []);
  const pickupMeshes = useRef<Map<PickupEntity, THREE.Mesh>>(new Map());

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

  // 2b. Dispose pickup meshes + geometry on unmount.
  useEffect(() => {
    const map = pickupMeshes.current;
    return () => {
      for (const [, m] of map) {
        pickupsGroup.remove(m);
        (m.material as THREE.Material).dispose();
      }
      map.clear();
      pickupGeo.dispose();
    };
  }, [pickupGeo, pickupsGroup]);

  // 2c. Self-mount the combat HUD overlay (crosshair / hitmarker / damage numbers) as a DOM
  //     sibling of <Canvas>, so it works the moment <CombatRig/> is mounted. Pass hud={false} to
  //     mount <CombatOverlay/> yourself instead. The overlay's ownership guard makes dupes safe.
  useEffect(() => {
    if (!hud || typeof document === "undefined") return;
    const host = document.createElement("div");
    host.dataset.combatHud = "1";
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    root.render(<CombatOverlay />);
    return () => {
      // Defer out of React's commit phase to avoid the nested-root unmount warning.
      queueMicrotask(() => {
        root.unmount();
        host.remove();
      });
    };
  }, [hud]);

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

    // Weapon pickups: lazily build a tinted mesh per entity, then bob + spin it.
    const pnow = performance.now();
    const pmap = pickupMeshes.current;
    for (const e of pickupQuery.entities) {
      let m = pmap.get(e);
      if (!m) {
        const accent = getWeapon(e.combat_weaponPickup!.weaponId)?.accent ?? "#ff9d5c";
        const mat = new THREE.MeshStandardMaterial({
          color: accent,
          emissive: accent,
          emissiveIntensity: 0.55,
          metalness: 0.3,
          roughness: 0.4,
        });
        m = new THREE.Mesh(pickupGeo, mat);
        m.frustumCulled = false;
        pickupsGroup.add(m);
        pmap.set(e, m);
      }
      const pk = e.combat_weaponPickup!;
      const taken = (pk.takenAt ?? 0) > 0;
      m.visible = !taken;
      if (!taken && e.transform) {
        const seed = pk.seed ?? 0;
        const pos = e.transform.position;
        m.position.set(pos.x, pos.y + 0.9 + Math.sin(pnow * 0.003 + seed) * 0.12, pos.z);
        m.rotation.y = pnow * 0.0016 + seed;
      }
    }
    // Prune meshes whose entity has despawned.
    for (const [e, m] of pmap) {
      if (!pickupQuery.entities.includes(e)) {
        pickupsGroup.remove(m);
        (m.material as THREE.Material).dispose();
        pmap.delete(e);
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
      <primitive object={pickupsGroup} />
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
