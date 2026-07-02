// "First Gear" — the scripted intro slice (walk → drive → shoot). Authored purely as data via
// the mission API; the runner executes it and the CanvasLayer visualises its markers/targets.
// Coordinates sit on the v0 test block ground (player spawns at [0,2,6]) so the whole slice is
// reachable + completable today; they map cleanly onto Sparks' marina garage / Neon Mile later.
import { defineMission } from "./missionApi";

export const FIRST_GEAR_ID = "onb.firstGear";

export const firstGear = defineMission({
  id: FIRST_GEAR_ID,
  titleKey: "onb.mission.firstGear.title",
  beats: [
    {
      id: "walk",
      objectiveKey: "onb.beat.walk",
      teaches: "Move + sprint to a destination",
      completeOn: ["zone:enter"],
      marker: { id: "onb_garage_door", position: [0, 0.05, 0], radius: 3, labelKey: "onb.marker.door" },
      timeoutMs: 45000,
    },
    {
      id: "drive-enter",
      objectiveKey: "onb.beat.drive.enter",
      teaches: "Enter a vehicle",
      completeOn: ["vehicle:enter", "player:vehicleKey"],
      enableVehicleKeyFallback: true,
      timeoutMs: 45000,
    },
    {
      id: "drive-go",
      objectiveKey: "onb.beat.drive.go",
      teaches: "Throttle / brake / steer to a marker",
      completeOn: ["zone:enter"],
      marker: {
        id: "onb_neon_mile",
        position: [18, 0.05, 10],
        radius: 4,
        labelKey: "onb.marker.neonMile",
      },
      timeoutMs: 60000,
    },
    {
      id: "shoot",
      objectiveKey: "onb.beat.shoot",
      teaches: "Aim + fire + reload",
      completeOn: ["combat:hitTarget"],
      goal: 5,
      fireCountsAsHit: true,
      targets: [
        { id: "can-1", position: [14, 1, 14] },
        { id: "can-2", position: [16, 1, 14] },
        { id: "can-3", position: [18, 1, 14] },
        { id: "can-4", position: [20, 1, 14] },
        { id: "can-5", position: [22, 1, 14] },
      ],
      timeoutMs: 90000,
    },
    {
      id: "done",
      objectiveKey: "onb.beat.done",
      teaches: "Wrap-up",
      completeOn: [],
      goal: 0,
      timeoutMs: 2600,
    },
  ],
});
