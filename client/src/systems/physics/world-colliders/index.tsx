// physics/world-colliders — the missing PHYSICS BRIDGE for static world geometry.
//
// Every world subsystem produced collider DATA but nothing ever turned it into real Rapier
// bodies, so the vehicle/player fell through everything except the Scene safety-floor. This one
// component (mounted ONCE inside <Physics>, e.g. game/Scene.tsx) reads those data sources and
// instantiates fixed Rapier colliders for them:
//
//   • render/city      → CityMapDoc.colliders (building/landmark cuboids)   → WORLD layer
//   • render/streaming → `stream_collider` ECS entities per resident chunk  → WORLD layer
//   • render/environment → env prop colliders (rocks/pilings) + heightfield → PROP / WORLD layers
//
// City + env colliders are static and large, so they are created imperatively on the shared
// Rapier world (one fixed body each) — far cheaper than thousands of React <RigidBody> nodes and
// the same pattern physics/ragdoll + gameplay/traffic already use. Streaming colliders come and
// go with chunk residency, so they ride the reactive ECS↔R3F bridge and clean themselves up when
// the streaming subsystem removes the entity on chunk unload.
import { useEffect } from "react";
import { CuboidCollider, RigidBody, useRapier } from "@react-three/rapier";
import { Layer, groupsFor } from "@sunbreak/shared";
import { ECS, world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { useCityStore } from "@/systems/render/city";
import { environmentApi, useEnvironment } from "@/systems/render/environment";

/** Quaternion (xyzw) for a yaw about +Y — Rapier collider descriptors take a quaternion. */
function quatY(rotY: number): { x: number; y: number; z: number; w: number } {
  const h = rotY * 0.5;
  return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}

// Per-chunk static colliders emitted by render/streaming (added on chunk-ready, removed on unload).
const streamColliderQuery = world.with("stream_collider", "transform");

function ChunkCollider({ entity }: { entity: ClientEntity }) {
  const c = entity.stream_collider!;
  const t = entity.transform!;
  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={[t.position.x, t.position.y, t.position.z]}
      rotation={[0, c.rotY ?? 0, 0]}
    >
      <CuboidCollider
        args={[c.half[0], c.half[1], c.half[2]]}
        collisionGroups={groupsFor(Layer.WORLD)}
      />
    </RigidBody>
  );
}

export interface WorldCollidersProps {
  /**
   * Also build a Rapier heightfield collider from the environment terrain. OFF by default: the
   * render/city core is a FLAT slab at y≈0 while the env terrain rises several metres inland, so a
   * blanket heightfield would make vehicles ride invisible bumps *inside* the city and regress the
   * (working) flat safety-floor ground. The implementation below is correct + ready — enable it
   * once the city is conformed to the terrain (or the heightfield is masked to the non-city area).
   */
  terrainHeightfield?: boolean;
}

/**
 * Mount ONCE inside the Rapier <Physics> tree. Instantiates the world's static colliders from the
 * city / streaming / environment data channels so vehicles + the player actually collide with
 * buildings, props and streamed geometry.
 */
export function WorldColliders({ terrainHeightfield = false }: WorldCollidersProps) {
  const { world: rworld, rapier } = useRapier();
  const cityDoc = useCityStore((s) => s.doc);
  const envReady = useEnvironment((s) => s.ready);

  // ── City buildings + landmarks → one fixed body, many cuboid colliders ─────────────────────
  useEffect(() => {
    if (!cityDoc) return;
    const body = rworld.createRigidBody(rapier.RigidBodyDesc.fixed());
    const worldGroups = groupsFor(Layer.WORLD);
    for (const c of cityDoc.colliders) {
      // Skip the city "ground" slab — the Scene safety-floor already provides the flat drivable
      // surface at y=0; instantiating it again would just duplicate that collider.
      if (c.tag === "ground") continue;
      const desc = rapier.ColliderDesc.cuboid(c.halfExtents[0], c.halfExtents[1], c.halfExtents[2])
        .setTranslation(c.position[0], c.position[1], c.position[2])
        .setRotation(quatY(c.rotationY))
        .setCollisionGroups(worldGroups)
        .setFriction(0.9);
      rworld.createCollider(desc, body);
    }
    return () => {
      rworld.removeRigidBody(body);
    };
  }, [rworld, rapier, cityDoc]);

  // ── Environment prop colliders (+ optional terrain heightfield) ─────────────────────────────
  useEffect(() => {
    if (!envReady) return;
    const body = rworld.createRigidBody(rapier.RigidBodyDesc.fixed());
    for (const c of environmentApi.getStaticColliders()) {
      let desc;
      if (c.shape === "sphere") {
        desc = rapier.ColliderDesc.ball(c.radius ?? 0.5);
      } else if (c.shape === "cylinder") {
        desc = rapier.ColliderDesc.cylinder((c.height ?? 1) * 0.5, c.radius ?? 0.3);
      } else {
        const h = c.halfExtents ?? { x: 0.5, y: 0.5, z: 0.5 };
        desc = rapier.ColliderDesc.cuboid(h.x, h.y, h.z);
      }
      desc
        .setTranslation(c.position.x, c.position.y, c.position.z)
        .setRotation(quatY(c.rotationY))
        .setCollisionGroups(groupsFor(c.layer as Layer));
      rworld.createCollider(desc, body);
    }

    let hfBody: ReturnType<typeof rworld.createRigidBody> | null = null;
    if (terrainHeightfield) {
      const hf = environmentApi.getHeightfield();
      // Rapier stores heights column-major with the row (local X) index fastest; the env grid is
      // row-major with the X index fastest too — so the layouts coincide and heights pass through
      // as-is. nrows/ncols are cell counts (res-1); scale is the full local X/Z span, centred.
      const segments = hf.res - 1;
      const span = segments * hf.cellSize;
      const heights = Float32Array.from(hf.heights);
      const desc = rapier.ColliderDesc.heightfield(segments, segments, heights, {
        x: span,
        y: 1,
        z: span,
      })
        .setTranslation(hf.origin.x + span * 0.5, 0, hf.origin.z + span * 0.5)
        .setCollisionGroups(groupsFor(Layer.WORLD))
        .setFriction(0.95);
      hfBody = rworld.createRigidBody(rapier.RigidBodyDesc.fixed());
      rworld.createCollider(desc, hfBody);
    }

    return () => {
      rworld.removeRigidBody(body);
      if (hfBody) rworld.removeRigidBody(hfBody);
    };
  }, [rworld, rapier, envReady, terrainHeightfield]);

  // ── Streaming per-chunk colliders (reactive; cleaned up on chunk unload by streaming) ───────
  return (
    <ECS.Entities in={streamColliderQuery}>
      {(entity) => <ChunkCollider entity={entity} />}
    </ECS.Entities>
  );
}
