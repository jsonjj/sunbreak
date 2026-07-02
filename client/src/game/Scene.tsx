import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { Layer, groupsFor } from "@sunbreak/shared";
import { PhysicsProvider } from "../physics/PhysicsProvider";
import { PlayerController } from "../player/PlayerController";
import { CameraRig } from "../camera/CameraRig";
import { SystemsRunner } from "./SystemsRunner";
import { InputBinder } from "../input/InputBinder";
import { isDebug } from "../util/debug";
import { ECS, world } from "../ecs/world";

// ── Subsystem R3F bridges (each subsystem self-registers on import via the systems-loader; here we
// only mount the React views that need to live in the scene graph / Rapier context). ────────────
import { VehiclePhysicsView } from "@/systems/physics/vehicle";
import { WorldColliders } from "@/systems/physics/world-colliders";
import { CombatRig } from "@/systems/gameplay/combat";
import { TrafficView } from "@/systems/gameplay/traffic";
import { WantedView } from "@/systems/gameplay/wanted";
import { RagdollBridge } from "@/systems/physics/ragdoll";
import { PedColliders } from "@/systems/gameplay/peds";
import { InteractionRig } from "@/systems/gameplay/interaction";
import { MissionMarkers } from "@/systems/gameplay/missions";
import { DebugCanvas } from "@/systems/content/debug-tools";

// The single, generic ECS→R3F bridge. Every render subsystem (city, lighting/sky, environment,
// streaming, peds, characters, vfx) publishes its visuals as an entity `three` view component and
// relies on this to mount them — no hand-mounting. We EXCLUDE entities owned by a dedicated view
// that parents its own `three` (vehicles → <VehicleBody>, traffic cars → <TrafficView>, police →
// <WantedView>) so those objects are never double-parented.
const threeView = world.with("three").without("veh_isVehicle", "traffic_car", "wanted_police");

/** The composed v1 scene graph mounted inside the R3F <Canvas>. */
export function Scene() {
  const debug = isDebug();
  return (
    <>
      {/* ── Permanent lit baseline (insurance) ───────────────────────────────────────────────
          v0's <Lighting/> + <Environment/> ground were removed in favour of the render subsystems,
          which publish their sky/sun/terrain through the bridge below. If ANY of those faults at
          runtime (or hasn't attached yet), this hand-mounted rig guarantees the world is never an
          unlit, pure-black void: a non-black sky clear-colour, ambient + hemisphere fill, a soft
          key light, and a large ground plane. The lighting subsystem's dynamic sky dome + sun and
          the environment terrain render ON TOP of this when healthy (the ground uses a polygon
          offset so real terrain/water always wins the depth test). */}
      {/* Dim fill + sky clear-colour only — the render/lighting subsystem owns the dynamic sun/sky/
          shadows now, so the baseline directional light was removed to avoid a doubled sun + double
          shadows. These low-intensity lights + the ground plane remain purely as anti-black-void
          insurance if the lighting subsystem ever faults. */}
      <color attach="background" args={["#9fc0dd"]} />
      <hemisphereLight args={["#bcd6ff", "#5a5040", 0.16]} />
      <ambientLight intensity={0.1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[3000, 3000]} />
        <meshStandardMaterial
          color="#7f8894"
          roughness={1}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>

      {/* Generic render bridge — serves every `three`-carrying subsystem. */}
      <ECS.Entities in={threeView}>
        {(e) => <primitive object={e.three!} dispose={null} />}
      </ECS.Entities>

      {/* Mission world markers / waypoints (reads the mission store; inert with no active mission). */}
      <MissionMarkers />

      <PhysicsProvider debug={debug}>
        {/* Safety floor: the flat drivable ground for the city core + districts (top at y=0, matching
            the city slab). Shrunk to ±480 (just past the outer districts, well INSIDE the ~542 m
            coastline) so it no longer extends over the beach/open sea — out there the environment
            terrain heightfield (WorldColliders) is the ground, letting the coast slope naturally into
            the water instead of the player/vehicles hovering on a flat slab above the sand. */}
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider
            args={[480, 0.5, 480]}
            position={[0, -0.5, 0]}
            collisionGroups={groupsFor(Layer.WORLD)}
          />
        </RigidBody>

        {/* Static world colliders: buildings/props (render/city), streamed chunks
            (render/streaming) and environment prop colliders (render/environment). This is what
            makes vehicles + the player stop driving through buildings and walls. */}
        <WorldColliders terrainHeightfield />

        <PlayerController />
        <CameraRig />

        {/* Rapier-context rigs (physics + occlusion + near-body sync). */}
        <VehiclePhysicsView />
        <TrafficView />
        <WantedView />
        <CombatRig />
        <RagdollBridge />
        {/* Pooled kinematic sensor capsules on near-player peds → vehicle impacts route to ragdoll. */}
        <PedColliders />
        <InteractionRig />

        <SystemsRunner />
      </PhysicsProvider>

      <InputBinder />
      {debug && <DebugCanvas />}
    </>
  );
}
