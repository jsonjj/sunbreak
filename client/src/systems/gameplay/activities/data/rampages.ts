// Rampage / score content. Targets are "clout" props the player smashes (reach) before time.

import type { RampageActivityDef } from "../types";

export const rampages: RampageActivityDef[] = [
  {
    id: "rampage_boardwalk_clout",
    kind: "rampage",
    name: "Boardwalk Clout Spree",
    region: "costa_dorada",
    blurb: "Smash as many clout props as you can before the timer taps out.",
    origin: [78, 0.5, 58],
    markerRadius: 5,
    goal: 6,
    countdownMs: 3000,
    timeLimitMs: 45_000,
    cooldownMs: 10_000,
    respawn: false,
    targets: [
      { pos: [96, 0.5, 40], radius: 5, value: 1 },
      { pos: [120, 0.5, 62], radius: 5, value: 1 },
      { pos: [104, 0.5, 90], radius: 5, value: 1 },
      { pos: [74, 0.5, 96], radius: 5, value: 1 },
      { pos: [52, 0.5, 74], radius: 5, value: 1 },
      { pos: [60, 0.5, 40], radius: 5, value: 1 },
      { pos: [132, 0.5, 96], radius: 5, value: 2 },
      { pos: [40, 0.5, 108], radius: 5, value: 2 },
    ],
    reward: { cash: 1200, dirty: true, skillXp: { strength: 25 } },
    rewardTiers: [
      { label: "Gold", minScore: 10, reward: { cash: 3000, dirty: true, skillXp: { strength: 60 } } },
      { label: "Silver", minScore: 8, reward: { cash: 2000, dirty: true, skillXp: { strength: 40 } } },
      { label: "Bronze", minScore: 6, reward: { cash: 1200, dirty: true, skillXp: { strength: 25 } } },
    ],
  },
];
