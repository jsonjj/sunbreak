// Port registry. Activities consume three sibling subsystems — Interaction (trigger), Economy
// (reward) and Map (blips) — exclusively through these ports. Defaults are self-contained
// fallbacks on the stable shared stores, so the subsystem is playable today. The integrator (or
// the sibling subsystems themselves) inject real adapters via configureActivityPorts().

import { createLocalInteractionPort, type InteractionPort } from "./interaction";
import { createDefaultEconPort, type EconPort } from "./econ";
import { createDefaultBlipsPort, type BlipsPort } from "./blips";

export type { InteractionPort, InteractionEntry } from "./interaction";
export type { EconPort, RewardMeta } from "./econ";
export type { BlipsPort, ActivityBlip, ActivityBlipKind } from "./blips";

export interface ActivityPorts {
  interaction: InteractionPort;
  econ: EconPort;
  blips: BlipsPort;
}

const ports: ActivityPorts = {
  interaction: createLocalInteractionPort(),
  econ: createDefaultEconPort(),
  blips: createDefaultBlipsPort(),
};

/** Read the live ports. Callers should read on demand (ports can be swapped at runtime). */
export const getPorts = (): ActivityPorts => ports;

/**
 * Inject real sibling implementations. Call once during integration, e.g.:
 *
 *   configureActivityPorts({
 *     econ: { grantReward: (r, m) => useEconomy.getState().grantPayout("cami", r.cash ?? 0, m.reason) },
 *     blips: { upsert: (b) => useMapStore.getState().upsertBlip({ id: b.id, style: b.kind, at: { x: b.x, z: b.z }, label: b.label }),
 *              remove: (id) => useMapStore.getState().removeBlip(id), clearOwned: () => {} },
 *     interaction: interactionAdapter, // local:false → Interaction drives focus + prompt
 *   });
 */
export function configureActivityPorts(overrides: Partial<ActivityPorts>): void {
  if (overrides.interaction) ports.interaction = overrides.interaction;
  if (overrides.econ) ports.econ = overrides.econ;
  if (overrides.blips) ports.blips = overrides.blips;
}
