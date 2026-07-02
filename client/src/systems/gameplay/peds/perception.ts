// Perception: turns threats (esp. combat gunfire/damage) into ped fear, decays fear over time,
// and propagates panic through the crowd (contagion). This is the "flee-from-gunfire" ingress.
//
// Threats reach peds three ways, all funnelling through `applyThreat`:
//   1. Direct calls: `applyThreat(ev)` / `reportDamageEvent(dmg)` (integrator wires combat here).
//   2. The `pedThreatBus` mitt emitter (subscribe/emit from anywhere that imports us).
//   3. Decoupled `window` CustomEvents (`sunbreak:damage|gunshot|explosion|threat`) so a combat
//      system can notify peds with ZERO import coupling. See installThreatBridges().

import mitt from "mitt";
import { world } from "@/ecs/world";
import {
  ARCHETYPES,
  CALM_COOLDOWN_S,
  CONTAGION_HZ,
  CONTAGION_INTENSITY,
  CONTAGION_RADIUS,
  FEAR_DECAY_PER_S,
  THREAT_DEFAULTS,
} from "./config";
import { forEachPedNear } from "./spatialHash";
import { pedQuery, getPlayer } from "./queries";
import type { DamageEventInput, ThreatEvent, ThreatKind } from "./types";

type PedBusEvents = {
  /** Fired for every applied threat (after fear is raised) — observers/audio can subscribe. */
  threat: ThreatEvent;
  /** Fired when a ped dies (see behavior.killPed). */
  death: { netId?: number; x: number; y: number; z: number };
};

/** Public ped event bus (mitt). Combat/audio/etc. may subscribe or emit. */
export const pedThreatBus = mitt<PedBusEvents>();

const netQuery = world.with("netId", "transform");

/** Raise fear on peds near a threat and set their flee-away vector. The core reaction trigger. */
export function applyThreat(ev: ThreatEvent): void {
  const def = THREAT_DEFAULTS[ev.kind] ?? THREAT_DEFAULTS.gunshot!;
  const radius = ev.radius > 0 ? ev.radius : def.radius;
  const intensity = ev.intensity > 0 ? ev.intensity : def.intensity;

  forEachPedNear(ev.x, ev.z, radius, (e, d2) => {
    const a = e.ped_agent;
    if (!a || a.state === "dead") return;
    if (ev.sourceNetId != null && e.netId === ev.sourceNetId) return;
    const d = Math.sqrt(d2);
    const falloff = 1 - d / radius; // linear falloff, ≥0 inside radius
    if (falloff <= 0) return;
    const add = intensity * falloff * ARCHETYPES[a.archetype].jumpiness;
    a.fear = Math.min(1, a.fear + add);
    // Blend the flee-away epicentre toward the newest, stronger threat.
    const w = Math.min(1, add);
    a.fleeX += (ev.x - a.fleeX) * w;
    a.fleeZ += (ev.z - a.fleeZ) * w;
  });

  pedThreatBus.emit("threat", ev);
}

/** Convenience: raise a positional gunshot/explosion/etc. threat. */
export function raiseThreat(
  kind: ThreatKind,
  x: number,
  z: number,
  opts?: { radius?: number; intensity?: number; sourceNetId?: number },
): void {
  applyThreat({
    kind,
    x,
    z,
    radius: opts?.radius ?? 0,
    intensity: opts?.intensity ?? 0,
    sourceNetId: opts?.sourceNetId,
  });
}

// ── Combat DamageEvent → threat adaptor ─────────────────────────────────────────────────────

function toXZ(v: unknown): { x: number; z: number } | null {
  if (!v) return null;
  if (Array.isArray(v)) {
    if (v.length >= 3) return { x: v[0] as number, z: v[2] as number };
    if (v.length === 2) return { x: v[0] as number, z: v[1] as number };
    return null;
  }
  if (typeof v === "object" && "x" in v && "z" in v) {
    return { x: (v as { x: number }).x, z: (v as { z: number }).z };
  }
  return null;
}

function posForNetId(netId: number | undefined): { x: number; z: number } | null {
  if (netId == null) return null;
  for (const e of netQuery) {
    if (e.netId === netId) return { x: e.transform.position.x, z: e.transform.position.z };
  }
  return null;
}

/**
 * Ingest a combat `DamageEvent`/`HitEvent`-shaped payload and turn it into a ped threat.
 * Resolves the epicentre from (in priority order): explicit point/position/origin → the ECS
 * transform of the referenced entity (target, then shooter) → the player position.
 */
export function reportDamageEvent(dmg: DamageEventInput): void {
  const kind: ThreatKind = dmg.kind ?? (dmg.lethal ? "explosion" : "gunshot");
  const pos =
    toXZ(dmg.point) ??
    toXZ(dmg.position) ??
    toXZ(dmg.origin) ??
    posForNetId(dmg.targetNetId) ??
    posForNetId(dmg.byNetId ?? dmg.sourceNetId);
  const p = getPlayer();
  const x = pos?.x ?? p?.transform?.position.x ?? 0;
  const z = pos?.z ?? p?.transform?.position.z ?? 0;
  applyThreat({
    kind,
    x,
    z,
    radius: dmg.radius ?? 0,
    intensity: dmg.intensity ?? 0,
    sourceNetId: dmg.byNetId ?? dmg.sourceNetId,
  });
}

// ── Per-tick fear dynamics + contagion ──────────────────────────────────────────────────────

let contagionAcc = 0;

/** Decay everyone's fear; periodically let panicking peds spread a weak threat (panic ripple). */
export function tickPerception(dt: number): void {
  const decay = Math.exp(-FEAR_DECAY_PER_S * dt);
  for (const e of pedQuery) {
    const a = e.ped_agent!;
    if (a.state === "dead") continue;
    a.fear *= decay;
    if (a.calmCooldown > 0) a.calmCooldown = Math.max(0, a.calmCooldown - dt);
  }

  contagionAcc += dt;
  const step = 1 / CONTAGION_HZ;
  if (contagionAcc < step) return;
  contagionAcc = 0;

  // Fear contagion: a bounded set of visibly-panicking peds emit a small local threat so panic
  // ripples outward without an O(n²) blowup.
  let spreaders = 0;
  for (const e of pedQuery) {
    if (spreaders >= 48) break;
    const a = e.ped_agent!;
    if (a.state !== "flee" && a.state !== "panic") continue;
    spreaders++;
    const t = e.transform!;
    forEachPedNear(
      t.position.x,
      t.position.z,
      CONTAGION_RADIUS,
      (other, d2) => {
        const oa = other.ped_agent!;
        if (oa.state === "dead" || oa.fear >= a.fear) return;
        const d = Math.sqrt(d2);
        const falloff = 1 - d / CONTAGION_RADIUS;
        oa.fear = Math.min(1, oa.fear + CONTAGION_INTENSITY * falloff * 0.5);
        oa.fleeX += (t.position.x - oa.fleeX) * 0.3;
        oa.fleeZ += (t.position.z - oa.fleeZ) * 0.3;
      },
      e,
    );
  }
}

// ── Decoupled window bridges ────────────────────────────────────────────────────────────────

type Handler = (ev: Event) => void;
let installed: Array<[string, Handler]> = [];

/**
 * Listen for cross-subsystem CustomEvents so combat (or the integrator) can trigger ped reactions
 * without importing us. Payload goes in `event.detail`. Returns an uninstall fn.
 */
export function installThreatBridges(): () => void {
  if (typeof window === "undefined") return () => {};
  const onDamage: Handler = (ev) => reportDamageEvent(((ev as CustomEvent).detail ?? {}) as DamageEventInput);
  const onGun: Handler = (ev) => bridgeThreat("gunshot", ev);
  const onBoom: Handler = (ev) => bridgeThreat("explosion", ev);
  const onThreat: Handler = (ev) => {
    const d = (ev as CustomEvent).detail as Partial<ThreatEvent> | undefined;
    if (d && typeof d.x === "number" && typeof d.z === "number") {
      applyThreat({
        kind: (d.kind as ThreatKind) ?? "gunshot",
        x: d.x,
        z: d.z,
        radius: d.radius ?? 0,
        intensity: d.intensity ?? 0,
        sourceNetId: d.sourceNetId,
      });
    }
  };
  const map: Array<[string, Handler]> = [
    ["sunbreak:damage", onDamage],
    ["sunbreak:gunshot", onGun],
    ["sunbreak:explosion", onBoom],
    ["sunbreak:threat", onThreat],
  ];
  for (const [name, h] of map) window.addEventListener(name, h);
  installed = map;
  return uninstallThreatBridges;
}

export function uninstallThreatBridges(): void {
  if (typeof window === "undefined") return;
  for (const [name, h] of installed) window.removeEventListener(name, h);
  installed = [];
}

function bridgeThreat(kind: ThreatKind, ev: Event): void {
  const d = (ev as CustomEvent).detail ?? {};
  const pos = toXZ(d.point) ?? toXZ(d.position) ?? toXZ(d.origin) ?? toXZ(d);
  if (!pos) return;
  applyThreat({ kind, x: pos.x, z: pos.z, radius: d.radius ?? 0, intensity: d.intensity ?? 0, sourceNetId: d.sourceNetId });
}
