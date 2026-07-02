// Drop-in wrapper for STANDALONE interactables (pickups, doors, shop points, fixed props). It
// spawns a lightweight ECS entity carrying `interact_`, renders its children, and mounts a Rapier
// sensor sized to the detection range for event-driven broad-phase + aim-pick collider mapping.
//
// For interactables that ALREADY own an entity + body (vehicles, NPCs), prefer the ECS-native
// path — `markInteractable(entity, cfg)` or adding the `interact_` component directly — so the
// sensor/position follow the moving body.

import { useEffect, useMemo, useRef } from "react";
import { BallCollider, CuboidCollider, RigidBody } from "@react-three/rapier";
import type { ReactNode } from "react";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import type { InteractionKind, InteractVerbConfig } from "./types";
import { INTERACTABLE_SENSOR_GROUPS, rangeFor } from "./constants";
import { spawnInteractable } from "./api";
import { registerCollider, unregisterCollider } from "./registry";
import { useInteractionStore } from "./store";
import { getFocusedEntity, resolveId, setFocusedEntity } from "./runtime";

export interface InteractableProps<D = unknown> {
  kind: InteractionKind;
  verb: string;
  id?: string;
  /** Key glyph override shown in the prompt (defaults to the kind's primary key, "E"). */
  keyGlyph?: string;
  label?: string;
  range?: number;
  priority?: number;
  hold?: number;
  requiresAim?: true;
  disabled?: boolean;
  secondaryVerb?: string;
  secondaryKey?: string;
  data?: D;
  /** World position of the interactable (also where the sensor is centred). */
  position?: [number, number, number];
  /** Mount a Rapier sensor for event-driven range detection (default true). */
  sensor?: boolean;
  /** Sensor shape (default "ball"). */
  shape?: "ball" | "cuboid";
  /** Half-extents for a cuboid sensor. */
  halfExtents?: [number, number, number];
  children?: ReactNode;
}

export function Interactable<D = unknown>(props: InteractableProps<D>) {
  const {
    position = [0, 0, 0],
    sensor = true,
    shape = "ball",
    halfExtents = [1, 1, 1],
    children,
  } = props;

  const entityRef = useRef<ClientEntity | null>(null);
  const range = rangeFor(props.kind, props.range);

  // Build the config from props (stable per meaningful change).
  const config = useMemo<InteractVerbConfig<D>>(
    () => ({
      kind: props.kind,
      verb: props.verb,
      key: props.keyGlyph,
      label: props.label,
      range: props.range,
      priority: props.priority,
      hold: props.hold,
      requiresAim: props.requiresAim,
      disabled: props.disabled ? true : undefined,
      id: props.id,
      secondaryVerb: props.secondaryVerb,
      secondaryKey: props.secondaryKey,
      data: props.data,
    }),
    [
      props.kind,
      props.verb,
      props.keyGlyph,
      props.label,
      props.range,
      props.priority,
      props.hold,
      props.requiresAim,
      props.disabled,
      props.id,
      props.secondaryVerb,
      props.secondaryKey,
      props.data,
    ],
  );
  const configRef = useRef(config);
  configRef.current = config;

  // Spawn / despawn the entity with the component's lifetime.
  useEffect(() => {
    const entity = spawnInteractable(configRef.current, position);
    entityRef.current = entity;
    return () => {
      const id = resolveId(entity);
      useInteractionStore.getState().removeInRange(id);
      if (getFocusedEntity() === entity) {
        setFocusedEntity(null);
        useInteractionStore.getState().setFocus(null, null);
      }
      world.remove(entity);
      entityRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the live config + position in sync with props (same component object).
  useEffect(() => {
    const entity = entityRef.current;
    if (entity?.interact_) Object.assign(entity.interact_, config);
  }, [config]);

  useEffect(() => {
    const entity = entityRef.current;
    if (entity?.transform) {
      entity.transform.position.x = position[0];
      entity.transform.position.y = position[1];
      entity.transform.position.z = position[2];
    }
  }, [position]);

  const onEnter = (handle: number): void => {
    const entity = entityRef.current;
    if (!entity) return;
    const id = resolveId(entity);
    registerCollider(handle, id);
    useInteractionStore.getState().addInRange(id);
  };
  const onExit = (handle: number): void => {
    const entity = entityRef.current;
    unregisterCollider(handle);
    if (entity) useInteractionStore.getState().removeInRange(resolveId(entity));
  };

  return (
    <group position={position}>
      {children}
      {sensor && (
        <RigidBody type="fixed" colliders={false} sensor>
          {shape === "cuboid" ? (
            <CuboidCollider
              args={halfExtents}
              sensor
              collisionGroups={INTERACTABLE_SENSOR_GROUPS}
              onIntersectionEnter={(p) => onEnter(p.target.collider.handle)}
              onIntersectionExit={(p) => onExit(p.target.collider.handle)}
            />
          ) : (
            <BallCollider
              args={[range]}
              sensor
              collisionGroups={INTERACTABLE_SENSOR_GROUPS}
              onIntersectionEnter={(p) => onEnter(p.target.collider.handle)}
              onIntersectionExit={(p) => onExit(p.target.collider.handle)}
            />
          )}
        </RigidBody>
      )}
    </group>
  );
}
