// Audio seam — combat is a SFX *producer*. Per the wave brief we "wire SFX via the existing audio
// hooks (don't edit the audio folder — just fire the existing events)". The audio/sound subsystem
// publishes a shared event bus on a stable global (`globalThis.__SUNBREAK_SFX__`) exactly so other
// folders can emit into it WITHOUT importing it (no cross-subsystem coupling / load-order risk).
// We access it defensively: if audio isn't mounted, every call is a harmless no-op.

import type { CombatSurface } from "../types";
import type { WeaponSfxKind } from "../weapons";

type V3 = { x: number; y: number; z: number };

/** Minimal structural view of the audio SFX bus (see audio/sound/bus.ts `SfxBusEvents`). */
interface SfxBusLike {
  emit(type: string, event: unknown): void;
}

function bus(): SfxBusLike | undefined {
  return (globalThis as unknown as { __SUNBREAK_SFX__?: SfxBusLike }).__SUNBREAK_SFX__;
}

/** Gunshot + shell casing for a hitscan weapon. Skipped for melee/thrown (no `kind`). */
export function sfxGunfire(kind: WeaponSfxKind | undefined, pos?: V3): void {
  if (!kind) return;
  bus()?.emit("gunfire", { weapon: kind, position: pos });
}

/** Reload rack — fired the moment a reload starts. */
export function sfxReload(pos?: V3): void {
  bus()?.emit("reload", { position: pos });
}

/** Dry-fire click when the trigger is pulled on an empty magazine. */
export function sfxDryFire(): void {
  bus()?.emit("play", { id: "gun_dry_fire" });
}

/** Surface-aware bullet impact (the bus maps `material` → the right impact clip). */
export function sfxImpact(surface: CombatSurface, pos?: V3): void {
  bus()?.emit("impact", { material: surface, position: pos });
}

/** Explosion (rocket / grenade detonation). */
export function sfxExplosion(pos?: V3): void {
  bus()?.emit("explosion", { position: pos });
}

/** Pickup chime when a weapon/ammo pickup is collected. */
export function sfxWeaponPickup(pos?: V3): void {
  bus()?.emit("pickup", { kind: "ammo", position: pos });
}
