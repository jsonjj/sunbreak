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
import { BOUNDARY } from "@/systems/render/city/geography";
import { environmentApi, useEnvironment } from "@/systems/render/environment";

/** Quaternion (xyzw) for a yaw about +Y — Rapier collider descriptors take a quaternion. */
function quatY(rotY: number): { x: number; y: number; z: number; w: number } {
  const h = rotY * 0.5;
  return { x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) };
}

// Per-chunk static colliders emitted by render/streaming (added on chunk-ready, removed on unload).
const streamColliderQuery = world.with("stream_collider", "transform");

/**
 * HARD WORLD BOUNDARY. Four invisible tall walls on the map edges stop the player + every
 * vehicle (car/boat) from leaving the island, and a horizontal ceiling caps aircraft so a
 * helicopter/plane can't fly off the top of the world. Walls rise from below the seabed to
 * above the ceiling, so there's no gap to slip through and nothing to fly over. The playable
 * area (±PLAYABLE_HALF) stays generous — it sits just inside the Scene safety-floor (±600) so
 * the player is always stopped while still on solid ground. All colliders are WORLD-layer.
 */
function WorldBoundary() {
  const worldGroups = groupsFor(Layer.WORLD);
  const half = BOUNDARY.maxX; // square playable area, centred on origin
  const t = 3; // wall half-thickness (m)
  const floorY = -8; // wall base (below the seabed)
  const topY = BOUNDARY.wallHeight; // wall crest (above the flight ceiling)
  const wallHalfY = (topY - floorY) / 2;
  const wallCy = (topY + floorY) / 2;
  const spanY = wallHalfY;
  // Walls overlap slightly past the corners (half + t) so there are no corner gaps.
  const spanHalf = half + t;
  return (
    <>
      {/* East / West walls (x = ±half) */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[t, spanY, spanHalf]} position={[half + t, wallCy, 0]} collisionGroups={worldGroups} />
        <CuboidCollider args={[t, spanY, spanHalf]} position={[-half - t, wallCy, 0]} collisionGroups={worldGroups} />
        {/* North / South walls (z = ±half) */}
        <CuboidCollider args={[spanHalf, spanY, t]} position={[0, wallCy, half + t]} collisionGroups={worldGroups} />
        <CuboidCollider args={[spanHalf, spanY, t]} position={[0, wallCy, -half - t]} collisionGroups={worldGroups} />
        {/* Flight ceiling: a horizontal cap so aircraft can't clear the walls from inside. */}
        <CuboidCollider args={[spanHalf, 1.5, spanHalf]} position={[0, BOUNDARY.ceilingY, 0]} collisionGroups={worldGroups} />
      </RigidBody>
    </>
  );
}

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
   * Also build a Rapier heightfield collider from the environment terrain, MASKED to the non-city
   * area (see below): heights are flattened to ~ground level within the city core (so the flat slab
   * + building colliders still own the working city) and ramp up to the real terrain past the city
   * edge, so leaving the city core no longer drops you through the world. Enabled by the integrator
   * in Scene.tsx; the flat safety-floor remains as a backstop underneath.
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
      // MASK TO NON-CITY: flatten heights to ~ground level within the city core (where the flat
      // slab + building colliders already provide collision), smoothly ramping up to the real
      // terrain height past the city edge. This makes the surrounding terrain collidable — so
      // leaving the city core no longer drops you through the world — WITHOUT introducing bumps
      // (or a boundary cliff) inside the working, flat city.
      const CITY_INNER = 140; // m from origin: fully flattened (city core stays exactly as before)
      const CITY_OUTER = 235; // m from origin: full terrain height
      const res = hf.res;
      for (let k = 0; k < heights.length; k++) {
        const xi = k % res;
        const zi = (k / res) | 0;
        const wx = hf.origin.x + xi * hf.cellSize;
        const wz = hf.origin.z + zi * hf.cellSize;
        const d = Math.hypot(wx, wz);
        const t = Math.min(1, Math.max(0, (d - CITY_INNER) / (CITY_OUTER - CITY_INNER)));
        heights[k] = (heights[k] ?? 0) * (t * t * (3 - 2 * t)); // smoothstep ramp
      }
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

  // ── Boundary walls/ceiling + streaming per-chunk colliders (reactive; cleaned on unload) ────
  return (
    <>
      <WorldBoundary />
      <ECS.Entities in={streamColliderQuery}>
        {(entity) => <ChunkCollider entity={entity} />}
      </ECS.Entities>
    </>
  );
}
