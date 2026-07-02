// Registers the Leva tuning schema. Every control is transient (has an `onChange`) and writes
// into useTuningStore, so gameplay systems read the STORE, not Leva — tuning survives even when
// Leva is stripped from a production build. This component renders nothing itself; the <Leva>
// panel in <Panels> displays the registered controls.

import { useControls, button } from "leva";
import { useTuningStore } from "../store/tuningStore";
import { useDebugStore } from "../store/debugStore";
import { cheats } from "../cheats/cheats";

export function LevaControls(): null {
  const set = useTuningStore.getState().set;
  const t = useTuningStore.getState();

  useControls("World", {
    timeOfDay: {
      value: t.world.timeOfDay,
      min: 0,
      max: 24,
      step: 0.1,
      onChange: (v: number) => set("world.timeOfDay", v),
    },
    sunIntensity: {
      value: t.world.sunIntensity,
      min: 0,
      max: 10,
      step: 0.05,
      onChange: (v: number) => set("world.sunIntensity", v),
    },
    fogDensity: {
      value: t.world.fogDensity,
      min: 0,
      max: 0.2,
      step: 0.001,
      onChange: (v: number) => set("world.fogDensity", v),
    },
  });

  useControls("Camera", {
    fov: { value: t.camera.fov, min: 30, max: 110, step: 1, onChange: (v: number) => set("camera.fov", v) },
    distance: {
      value: t.camera.distance,
      min: 1,
      max: 20,
      step: 0.1,
      onChange: (v: number) => set("camera.distance", v),
    },
    height: {
      value: t.camera.height,
      min: 0,
      max: 5,
      step: 0.05,
      onChange: (v: number) => set("camera.height", v),
    },
    damping: {
      value: t.camera.damping,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: (v: number) => set("camera.damping", v),
    },
  });

  useControls("Player", {
    walkSpeed: {
      value: t.player.walkSpeed,
      min: 0,
      max: 12,
      step: 0.1,
      onChange: (v: number) => set("player.walkSpeed", v),
    },
    runSpeed: {
      value: t.player.runSpeed,
      min: 0,
      max: 20,
      step: 0.1,
      onChange: (v: number) => set("player.runSpeed", v),
    },
    sprintSpeed: {
      value: t.player.sprintSpeed,
      min: 0,
      max: 25,
      step: 0.1,
      onChange: (v: number) => set("player.sprintSpeed", v),
    },
    jumpSpeed: {
      value: t.player.jumpSpeed,
      min: 0,
      max: 20,
      step: 0.1,
      onChange: (v: number) => set("player.jumpSpeed", v),
    },
  });

  useControls("Vehicle", {
    engineForce: {
      value: t.vehicle.engineForce,
      min: 0,
      max: 6000,
      step: 50,
      onChange: (v: number) => set("vehicle.engineForce", v),
    },
    brakeForce: {
      value: t.vehicle.brakeForce,
      min: 0,
      max: 8000,
      step: 50,
      onChange: (v: number) => set("vehicle.brakeForce", v),
    },
    steer: {
      value: t.vehicle.steer,
      min: 0,
      max: 1.5,
      step: 0.01,
      onChange: (v: number) => set("vehicle.steer", v),
    },
    suspension: {
      value: t.vehicle.suspension,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: (v: number) => set("vehicle.suspension", v),
    },
  });

  useControls("Physics", {
    gravityY: {
      value: t.physics.gravityY,
      min: -30,
      max: 0,
      step: 0.1,
      onChange: (v: number) => set("physics.gravityY", v),
    },
    paused: { value: t.physics.paused, onChange: (v: boolean) => set("physics.paused", v) },
    showColliders: {
      value: useDebugStore.getState().physicsDebug,
      onChange: (v: boolean) => {
        set("physics.showColliders", v);
        useDebugStore.getState().set({ physicsDebug: v });
      },
    },
  });

  useControls("Render", {
    quality: {
      value: t.render.quality,
      options: ["low", "medium", "high"],
      onChange: (v: string) => set("render.quality", v),
    },
    shadowMapSize: {
      value: t.render.shadowMapSize,
      options: [512, 1024, 2048, 4096],
      onChange: (v: number) => set("render.shadowMapSize", v),
    },
    pixelRatio: {
      value: t.render.pixelRatio,
      min: 0.5,
      max: 3,
      step: 0.1,
      onChange: (v: number) => set("render.pixelRatio", v),
    },
  });

  useControls("PostFX", {
    bloom: { value: t.postfx.bloom, min: 0, max: 3, step: 0.05, onChange: (v: number) => set("postfx.bloom", v) },
    exposure: {
      value: t.postfx.exposure,
      min: 0,
      max: 3,
      step: 0.05,
      onChange: (v: number) => set("postfx.exposure", v),
    },
  });

  useControls("Cheats", {
    god: button(() => {
      cheats.setGod();
    }),
    heal: button(() => {
      cheats.heal();
    }),
    "spawn car": button(() => {
      cheats.spawnEntity("car");
    }),
    "spawn prop": button(() => {
      cheats.spawnEntity("prop");
    }),
    "spawn ped": button(() => {
      cheats.spawnEntity("ped");
    }),
    "kill spawned": button(() => {
      cheats.killDbgSpawned();
    }),
  });

  return null;
}
