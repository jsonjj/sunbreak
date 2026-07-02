// Module-local runtime for spawned vehicles: the handle registry plus the spawn/despawn API.
//
// Live Rapier/THREE refs deliberately live here (keyed by entity) instead of on the ECS
// entity, so sim components stay serializable POJOs (the ECS holds only `veh_*` data + the
// standard `three`/`rigidBody` view components). Consumers get a stable `VehicleHandle`.
import * as THREE from "three";
import type { RapierRigidBody } from "@react-three/rapier";
import type { Vec3Tuple, VehicleId } from "@sunbreak/shared";
import { identityTransform, type Transform } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import {
  createEmptyDriverInput,
  createInitialVehicleState,
  type DriverInput,
  type RapierVehicleController,
  type VehicleConfig,
  type VehicleHandle,
  type VehicleSpawnRequest,
  type VehicleState,
} from "./types";
import { resolveVehicleConfig } from "./presets";

const _euler = new THREE.Euler(0, 0, 0, "YXZ");
const _quat = new THREE.Quaternion();

/**
 * Concrete handle. Public surface is {@link VehicleHandle}; the extra mutable fields are the
 * private contract shared with `useVehicleController` (fills refs) and `handling.ts` (per-step
 * scratch/state). They are intentionally not part of the exported interface.
 */
export class VehicleHandleImpl implements VehicleHandle {
  readonly entity: ClientEntity;
  config: VehicleConfig;
  chassis: RapierRigidBody | null = null;
  controller: RapierVehicleController | null = null;
  /** Wheel visual groups in [FL, FR, RL, RR] order (synced each step). */
  wheels: THREE.Object3D[] = [];
  /** Visual root (the `three` view component). */
  visual: THREE.Object3D | null = null;
  /** Spinning rotor/propeller visual groups (aircraft) — animated by the dynamic controller. */
  rotors: THREE.Object3D[] = [];
  /** Accumulated rotor/prop spin angle (rad). */
  rotorAngle = 0;
  readonly netId?: number;

  // --- per-step mutable state (owned by handling.ts) ---
  steerAngle = 0;
  drifting = false;
  driftScore = 0;
  engineHealth = 1;
  baseFrictionSlip: number[] = [];
  baseSideFriction: number[] = [];

  private _ready = false;
  private _resolveReady!: (h: VehicleHandle) => void;
  readonly ready: Promise<VehicleHandle>;

  constructor(entity: ClientEntity, config: VehicleConfig) {
    this.entity = entity;
    this.config = config;
    this.netId = entity.netId;
    this.ready = new Promise<VehicleHandle>((resolve) => {
      this._resolveReady = resolve;
    });
  }

  isReady(): boolean {
    return this._ready;
  }

  /** Called by the controller hook once chassis + controller are live. */
  markReady(): void {
    if (this._ready) return;
    this._ready = true;
    this._resolveReady(this);
  }

  setDriverInput(input: Partial<DriverInput>): void {
    const cur = (this.entity.veh_input ??= createEmptyDriverInput());
    if (input.throttle !== undefined) cur.throttle = input.throttle;
    if (input.brake !== undefined) cur.brake = input.brake;
    if (input.steer !== undefined) cur.steer = input.steer;
    if (input.handbrake !== undefined) cur.handbrake = input.handbrake;
    if (input.reverse !== undefined) cur.reverse = input.reverse;
  }

  getState(): Readonly<VehicleState> {
    return (this.entity.veh_state ??= createInitialVehicleState());
  }

  applyEngineHealth(h01: number): void {
    const h = Math.max(0, Math.min(1, h01));
    this.engineHealth = h;
    this.entity.veh_engineHealth = h;
  }

  resetVehicle(): void {
    const b = this.chassis;
    if (!b) return;
    const t = b.translation();
    const r = b.rotation();
    _quat.set(r.x, r.y, r.z, r.w);
    _euler.setFromQuaternion(_quat, "YXZ");
    _quat.setFromEuler(new THREE.Euler(0, _euler.y, 0, "YXZ"));
    b.setTranslation({ x: t.x, y: t.y + 1.2, z: t.z }, true);
    b.setRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    b.wakeUp();
  }

  dispose(): void {
    despawnVehicle(this.entity);
  }
}

/** entity -> live handle. */
const handles = new Map<ClientEntity, VehicleHandleImpl>();

/** Get (or lazily create) the handle for a vehicle entity. */
export function getOrCreateHandle(entity: ClientEntity, config: VehicleConfig): VehicleHandleImpl {
  let h = handles.get(entity);
  if (!h) {
    h = new VehicleHandleImpl(entity, config);
    handles.set(entity, h);
  } else {
    h.config = config;
  }
  return h;
}

/** Public lookup: returns the handle for an entity, if any. */
export function getVehicleHandle(entity: ClientEntity): VehicleHandle | undefined {
  return handles.get(entity);
}

function quatFromRequest(req: VehicleSpawnRequest): Transform["rotation"] {
  if (req.quaternion) {
    const [x, y, z, w] = req.quaternion;
    return { x, y, z, w };
  }
  _quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), req.rotationY ?? 0);
  return { x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w };
}

/** Build a fresh Transform from a spawn request. */
export function spawnTransform(req: VehicleSpawnRequest): Transform {
  const tf = identityTransform();
  tf.position = { x: req.position[0], y: req.position[1], z: req.position[2] };
  tf.rotation = quatFromRequest(req);
  return tf;
}

/**
 * Ensure an entity that carries a `veh_spawnRequest` has the full vehicle component set and the
 * `veh_isVehicle` tag (which makes the render bridge mount its body). Idempotent.
 */
export function normalizeVehicleEntity(entity: ClientEntity): void {
  const req = entity.veh_spawnRequest;
  if (!req) return;
  const config = entity.veh_config ?? resolveVehicleConfig(req.spec, req.color);
  entity.veh_config = config;
  entity.veh_input ??= createEmptyDriverInput();
  entity.veh_state ??= createInitialVehicleState();
  entity.veh_engineHealth ??= 1;
  if (req.netId !== undefined && entity.netId === undefined) entity.netId = req.netId;
  // `transform` is a query key elsewhere — add it (reindexes) rather than assigning directly.
  if (!entity.transform) world.addComponent(entity, "transform", spawnTransform(req));
  if (!entity.veh_isVehicle) world.addComponent(entity, "veh_isVehicle", true);
}

export interface SpawnVehicleOptions {
  rotationY?: number;
  quaternion?: [number, number, number, number];
  netId?: number;
  color?: string;
}

/**
 * Spawn a vehicle: create its ECS entity (with the full `veh_*` component set + the
 * `veh_isVehicle` tag) and return a handle immediately. The chassis/controller populate once
 * the render bridge mounts the body — await `handle.ready` if you need them.
 */
export function spawnVehicle(
  spec: VehicleId | string | VehicleConfig,
  position: Vec3Tuple,
  opts: SpawnVehicleOptions = {},
): VehicleHandle {
  const config = resolveVehicleConfig(spec, opts.color);
  const req: VehicleSpawnRequest = {
    spec,
    position,
    rotationY: opts.rotationY,
    quaternion: opts.quaternion,
    netId: opts.netId,
    color: opts.color,
  };
  const entity: ClientEntity = {
    veh_isVehicle: true,
    veh_spawnRequest: req,
    veh_config: config,
    veh_input: createEmptyDriverInput(),
    veh_state: createInitialVehicleState(),
    veh_engineHealth: 1,
    transform: spawnTransform(req),
  };
  if (opts.netId !== undefined) entity.netId = opts.netId;
  world.add(entity);
  return getOrCreateHandle(entity, config);
}

const isHandle = (t: VehicleHandle | ClientEntity): t is VehicleHandle =>
  typeof (t as VehicleHandle).dispose === "function" && "entity" in t;

/**
 * Despawn a vehicle by handle or entity: removes it from the world (which unmounts its body and
 * frees the Rapier controller via the bridge's cleanup) and drops the handle.
 */
export function despawnVehicle(target: VehicleHandle | ClientEntity): void {
  const entity = isHandle(target) ? target.entity : target;
  handles.delete(entity);
  world.remove(entity);
}
