// Delivery / gig content. Each leg is a pickup→dropoff pair; per-leg payouts accumulate and are
// paid on completion, with a time tier bonus on top.

import type { DeliveryActivityDef } from "../types";

export const deliveries: DeliveryActivityDef[] = [
  {
    id: "delivery_grubrunr_dash",
    kind: "delivery",
    name: "GrubRunr Dash",
    region: "miracle_row",
    blurb: "Three drops, one tight window. Keep the food hot and the tips fat.",
    origin: [-38, 0.5, -58],
    markerRadius: 5,
    countdownMs: 3000,
    timeLimitMs: 120_000,
    cooldownMs: 8000,
    legs: [
      { pickup: [-60, 0.5, -80], dropoff: [-110, 0.5, -40], radius: 6, payout: 350 },
      { pickup: [-90, 0.5, -10], dropoff: [-30, 0.5, 20], radius: 6, payout: 450 },
      { pickup: [10, 0.5, -30], dropoff: [70, 0.5, -70], radius: 6, payout: 600 },
    ],
    reward: { cash: 0, skillXp: { driving: 20 } },
    rewardTiers: [
      { label: "Gold", maxTimeMs: 70_000, reward: { cash: 800, skillXp: { driving: 50 } } },
      { label: "Silver", maxTimeMs: 95_000, reward: { cash: 400, skillXp: { driving: 35 } } },
      { label: "Bronze", maxTimeMs: 120_000, reward: { cash: 150, skillXp: { driving: 20 } } },
    ],
  },
];
