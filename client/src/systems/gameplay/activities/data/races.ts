// Street race content. Coordinates are world-space (X/Z ground plane) near the v0 spawn so the
// slice is immediately playable; swap for baked road coords when World/Map ship.

import type { RaceActivityDef } from "../types";

export const races: RaceActivityDef[] = [
  {
    id: "race_neon_mile",
    kind: "race",
    name: "Neon Mile Sprint",
    region: "santa_vista",
    blurb: "Point-to-point dash down the strip. Hit every checkpoint before the clock dies.",
    origin: [36, 0.5, -18],
    markerRadius: 5,
    mode: "sprint",
    timeLimitMs: 60_000,
    countdownMs: 3000,
    cooldownMs: 8000,
    checkpoints: [
      { pos: [60, 0.5, -40], radius: 7 },
      { pos: [110, 0.5, -70], radius: 7 },
      { pos: [150, 0.5, -120], radius: 7 },
      { pos: [200, 0.5, -160], radius: 8 },
    ],
    reward: { cash: 1500, skillXp: { driving: 30 } },
    rewardTiers: [
      { label: "Gold", maxTimeMs: 32_000, reward: { cash: 3200, skillXp: { driving: 60 }, unlockId: "livery_neon" } },
      { label: "Silver", maxTimeMs: 42_000, reward: { cash: 2400, skillXp: { driving: 45 } } },
      { label: "Bronze", maxTimeMs: 60_000, reward: { cash: 1500, skillXp: { driving: 30 } } },
    ],
  },
  {
    id: "race_harbor_loop",
    kind: "race",
    name: "Harbor Loop Circuit",
    region: "puerto_vista",
    blurb: "Two laps around the harbor block. Consistency wins.",
    origin: [-58, 0.5, 44],
    markerRadius: 5,
    mode: "circuit",
    laps: 2,
    timeLimitMs: 95_000,
    countdownMs: 3000,
    cooldownMs: 8000,
    checkpoints: [
      { pos: [-90, 0.5, 30], radius: 7 },
      { pos: [-120, 0.5, 80], radius: 7 },
      { pos: [-70, 0.5, 120], radius: 7 },
      { pos: [-30, 0.5, 80], radius: 7 },
    ],
    reward: { cash: 2000, skillXp: { driving: 40 } },
    rewardTiers: [
      { label: "Gold", maxTimeMs: 70_000, reward: { cash: 4000, skillXp: { driving: 80 } } },
      { label: "Silver", maxTimeMs: 84_000, reward: { cash: 3000, skillXp: { driving: 55 } } },
      { label: "Bronze", maxTimeMs: 95_000, reward: { cash: 2000, skillXp: { driving: 40 } } },
    ],
  },
];
