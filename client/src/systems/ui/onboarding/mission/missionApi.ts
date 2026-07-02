// Mission-authoring API used to author the "First Gear" intro slice.
//
// The gameplay/missions subsystem is a stub in this wave and exposes no shared API, and
// file-ownership forbids us editing it. So we author the intro against this small, self-
// contained authoring contract and run it with our own scripted runner (exactly the fallback
// the onboarding plan prescribes: "ship the data-driven step runner; migrate to missions
// later"). `registerMission` ALSO best-effort forwards the script to a global mission host if
// the missions subsystem later publishes one — so the same authored data migrates with zero
// rewrites.
import type { Vec3Tuple } from "@sunbreak/shared";
import type { OnbEventKey } from "../bus";
import type { I18nKey } from "../i18n/en";

export interface BeatMarker {
  /** Emitted as `zone:enter` when the player crosses it. */
  id: string;
  position: Vec3Tuple;
  radius: number;
  labelKey?: I18nKey;
}

export interface BeatTarget {
  id: string;
  position: Vec3Tuple;
}

export interface MissionBeat {
  id: string;
  /** Player-facing objective (i18n key). */
  objectiveKey: I18nKey;
  /** Design note: what this beat teaches. */
  teaches: string;
  /** Events that advance the beat; each occurrence adds 1 toward `goal`. */
  completeOn: OnbEventKey[];
  /** Occurrences required (default 1). A `0` goal makes the beat time-only (terminal cards). */
  goal?: number;
  /** Optional distance trigger the runner watches the player against. */
  marker?: BeatMarker;
  /** Optional breakable targets spawned on beat enter, despawned on exit. */
  targets?: BeatTarget[];
  /** Auto-advance guard so a beat can never soft-lock. */
  timeoutMs?: number;
  /** When no CanvasLayer is mounted, count `combat:fire` as a target hit (shooting drill). */
  fireCountsAsHit?: boolean;
  /** During this beat, the enter/exit key emits the `player:vehicleKey` fallback. */
  enableVehicleKeyFallback?: boolean;
}

export interface MissionScript {
  id: string;
  titleKey: I18nKey;
  beats: MissionBeat[];
}

/** Identity helper that pins the authored object to the `MissionScript` type. */
export function defineMission(script: MissionScript): MissionScript {
  return script;
}

// ── optional runtime bridge to a future gameplay/missions subsystem ─────────────
export interface MissionHost {
  register: (script: MissionScript) => void;
}

const HOST_KEY = "__SUNBREAK_MISSION_HOST__";

function getMissionHost(): MissionHost | undefined {
  const host = (globalThis as Record<string, unknown>)[HOST_KEY];
  if (host && typeof (host as MissionHost).register === "function") return host as MissionHost;
  return undefined;
}

const localRegistry = new Map<string, MissionScript>();

/**
 * Register a mission. Always stored locally (our runner reads it); additionally forwarded to
 * the global mission host if the missions subsystem has published one (best-effort, never
 * throws). Returns the script for convenient chaining.
 */
export function registerMission(script: MissionScript): MissionScript {
  localRegistry.set(script.id, script);
  try {
    getMissionHost()?.register(script);
  } catch {
    /* a broken external host must never break onboarding */
  }
  return script;
}

export const getMission = (id: string): MissionScript | undefined => localRegistry.get(id);
export const allMissions = (): readonly MissionScript[] => [...localRegistry.values()];
