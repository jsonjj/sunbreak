// World-state injection. Builds a terse `WorldSnapshot` from live game state so replies
// are grounded in what's happening right now. Reads the stable CORE stores directly
// (game + hud) and exposes seams so sibling subsystems (wanted, streaming, daynight,
// inventory) can enrich the snapshot WITHOUT this file importing them (parallel wave).
import { CharacterId } from "@sunbreak/shared";
import type { Vec3, WantedLevel } from "@sunbreak/shared";
import type { ClientEntity } from "@/ecs/clientEntity";
import { world } from "@/ecs/world";
import { useGameStore } from "@/stores/game.store";
import { useHudStore } from "@/stores/hud.store";
import type { PersonaCard, WorldSnapshot } from "./types";

export interface WorldStateContext {
  entity?: ClientEntity;
  card: PersonaCard;
}

export type WorldStateProvider = (ctx: WorldStateContext) => Partial<WorldSnapshot>;
export type DistrictResolver = (pos: Vec3) => { district?: string; region?: string } | null;

const providers: WorldStateProvider[] = [];
let districtResolver: DistrictResolver | null = null;

/**
 * Register a provider that enriches the snapshot (e.g. the wanted subsystem supplies
 * `wantedLevel`, inventory supplies `carryingContraband`). Later providers win on
 * conflicts. Returns an unregister fn.
 */
export function registerWorldStateProvider(provider: WorldStateProvider): () => void {
  providers.push(provider);
  return () => {
    const i = providers.indexOf(provider);
    if (i >= 0) providers.splice(i, 1);
  };
}

/** Register the authoritative position→district resolver (owned by render/streaming). */
export function registerDistrictResolver(resolver: DistrictResolver): void {
  districtResolver = resolver;
}

const playerQuery = world.with("isPlayer", "transform");

function playerPosition(): Vec3 | undefined {
  const player = playerQuery.entities[0];
  return player?.transform?.position;
}

function leadFromGame(): "cami" | "mac" {
  try {
    return useGameStore.getState().activeCharacter === CharacterId.Mac ? "mac" : "cami";
  } catch {
    return "cami";
  }
}

function clampWanted(n: number): WantedLevel {
  const v = Math.max(0, Math.min(5, Math.round(n)));
  return v as WantedLevel;
}

function wantedFromHud(): WantedLevel {
  try {
    return clampWanted(useHudStore.getState().heat ?? 0);
  } catch {
    return 0;
  }
}

function timeOfDayFromClock(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

function clean(patch: Partial<WorldSnapshot>): Partial<WorldSnapshot> {
  const out: Partial<WorldSnapshot> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && v !== null) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/**
 * Assemble the live snapshot for a persona/entity. Falls back to the persona's home
 * district/region and neutral defaults when no provider/resolver is registered yet.
 */
export function collectWorldSnapshot(
  entity: ClientEntity | undefined,
  card: PersonaCard,
): WorldSnapshot {
  const snapshot: WorldSnapshot = {
    lead: leadFromGame(),
    district: card.district ?? "Santa Vista",
    region: card.region ?? "Santa Vista",
    wantedLevel: wantedFromHud(),
    timeOfDay: timeOfDayFromClock(),
    trust: typeof entity?.npc_relationship === "number" ? entity.npc_relationship : 50,
    carryingContraband: false,
  };

  const pos = playerPosition() ?? entity?.transform?.position;
  if (pos && districtResolver) {
    try {
      const d = districtResolver(pos);
      if (d?.district) snapshot.district = d.district;
      if (d?.region) snapshot.region = d.region;
    } catch {
      /* keep persona defaults */
    }
  }

  let result = snapshot;
  for (const provider of providers) {
    try {
      result = { ...result, ...clean(provider({ entity, card })) };
    } catch {
      /* a bad provider must never break dialogue */
    }
  }
  return result;
}

/** Flatten to the openai-service `context` map (string|number|boolean values only). */
export function flattenSnapshot(
  snapshot: WorldSnapshot,
  card: PersonaCard,
): Record<string, string | number | boolean> {
  const ctx: Record<string, string | number | boolean> = {
    npcId: card.id,
    npcName: card.name,
    npcRole: card.role,
    lead: snapshot.lead,
    district: snapshot.district,
    region: snapshot.region,
    wantedLevel: snapshot.wantedLevel,
    timeOfDay: snapshot.timeOfDay,
  };
  if (card.faction) ctx.faction = card.faction;
  if (snapshot.weather) ctx.weather = snapshot.weather;
  if (typeof snapshot.trust === "number") ctx.trust = snapshot.trust;
  if (typeof snapshot.carryingContraband === "boolean") {
    ctx.carryingContraband = snapshot.carryingContraband;
  }
  if (typeof snapshot.nearbyPlayers === "number") ctx.nearbyPlayers = snapshot.nearbyPlayers;
  return ctx;
}
