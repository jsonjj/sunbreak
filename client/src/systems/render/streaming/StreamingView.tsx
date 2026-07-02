// OPTIONAL R3F mount for integrators. Two ways to get the streamed world on screen (pick ONE):
//   (a) Generic ECS↔R3F bridge — render entities tagged `stream_root` (and any `three` entity):
//         <ECS.Entities in={world.with("stream_root")}>{(e) => <primitive object={e.three!} />}</ECS.Entities>
//       This benefits every render subsystem and needs no import from this folder.
//   (b) This component — mounts the streaming root directly and (optionally) the per-chunk static
//       Rapier colliders emitted as `stream_collider` ECS entities.
// Mounting BOTH would double-parent the root, so choose one. Streaming itself is driven by the
// self-registered ECS `update` system regardless of whether this component is mounted.
import { useMemo } from "react";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { Layer, groupsFor } from "@sunbreak/shared";
import { ECS, world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { getEngine } from "./engine";

const colliderQuery = world.with("stream_collider", "transform");

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
      <CuboidCollider args={[c.half[0], c.half[1], c.half[2]]} collisionGroups={groupsFor(Layer.WORLD)} />
    </RigidBody>
  );
}

export interface StreamingViewProps {
  /** Mount the per-chunk static colliders as fixed Rapier bodies (default true). */
  colliders?: boolean;
}

export function StreamingView({ colliders = true }: StreamingViewProps) {
  const root = useMemo(() => getEngine().root, []);
  return (
    <>
      <primitive object={root} />
      {colliders && (
        <ECS.Entities in={colliderQuery}>{(entity) => <ChunkCollider entity={entity} />}</ECS.Entities>
      )}
    </>
  );
}
