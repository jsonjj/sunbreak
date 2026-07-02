// Event/state listeners: translate discrete gameplay events (combat, vehicles, UI, pickups,
// wanted, missions) arriving on the shared SFX bus — plus a few UI-store transitions and the
// persisted audio settings — into catalog plays. Component-derived sounds (footsteps, engine,
// damage) are handled by the ECS systems and are NOT wired here.

import { getBackend, onBackendChange } from "./runtime";
import { playEvent } from "./dispatch";
import {
  sfxBus,
  type ImpactMaterial,
  type PickupSfxKind,
  type SfxBusEvents,
  type UiSfxKind,
  type VehicleSfxKind,
} from "./bus";
import type { SoundEventId } from "./catalog";
import type { SfxBus } from "./types";
import { useUiStore } from "@/stores/ui.store";
import { useSettingsStore } from "@/stores/settings.store";
import type { SettingsState } from "@sunbreak/shared";

function gunIdFor(weapon: string | undefined): SoundEventId {
  switch (weapon) {
    case "rifle":
      return "gun_rifle_fire";
    case "shotgun":
      return "gun_shotgun_fire";
    case "smg":
      return "gun_smg_fire";
    default:
      return "gun_pistol_fire";
  }
}

function impactIdFor(material: ImpactMaterial | undefined): SoundEventId {
  switch (material) {
    case "metal":
      return "bullet_impact_metal";
    case "wood":
      return "bullet_impact_wood";
    case "glass":
      return "bullet_impact_glass";
    case "flesh":
      return "bullet_impact_flesh";
    case "dirt":
    case "grass":
    case "sand":
    case "gravel":
      return "bullet_impact_dirt";
    default:
      return "bullet_impact_concrete";
  }
}

const VEHICLE_ID: Record<VehicleSfxKind, SoundEventId> = {
  horn: "vehicle_horn",
  door_open: "vehicle_door_open",
  door_close: "vehicle_door_close",
  collision_soft: "vehicle_collision_soft",
  collision_hard: "vehicle_collision_hard",
  glass: "glass_smash",
  ignition: "vehicle_ignition",
  shutdown: "vehicle_shutdown",
  screech: "tire_screech",
};

const UI_ID: Record<UiSfxKind, SoundEventId> = {
  click: "ui_click",
  hover: "ui_hover",
  confirm: "ui_confirm",
  cancel: "ui_cancel",
  error: "ui_error",
  open: "ui_open",
  close: "ui_close",
  notification: "notification",
  map_ping: "map_ping",
  checkpoint: "checkpoint",
  phone_ring: "phone_ring",
  phone_tap: "phone_tap",
};

const PICKUP_ID: Record<PickupSfxKind, SoundEventId> = {
  cash: "cash_pickup",
  ammo: "ammo_pickup",
  health: "health_pickup",
};

function applyVolumes(audio: SettingsState["audio"]): void {
  const b = getBackend();
  b.setMasterVolume(audio.master);
  const perBus: Record<SfxBus, number> = {
    sfx: audio.sfx,
    vehicles: audio.sfx,
    ambience: audio.sfx * 0.9,
    ui: audio.sfx,
    music: audio.music,
    voice: audio.voice,
  };
  (Object.keys(perBus) as SfxBus[]).forEach((bus) => b.setBusVolume(bus, perBus[bus]));
}

/** Subscribe every event/state source. Returns a cleanup that detaches all of them. */
export function installEventListeners(): () => void {
  let lastWanted = 0;

  const onPlay = (e: SfxBusEvents["play"]): void => {
    const { id, ...opts } = e;
    playEvent(id, opts);
  };
  const onGunfire = (e: SfxBusEvents["gunfire"]): void => {
    playEvent(gunIdFor(e.weapon ? String(e.weapon) : undefined), { position: e.position });
    playEvent("shell_casing", { position: e.position });
  };
  const onReload = (e: SfxBusEvents["reload"]): void => {
    playEvent("weapon_reload", { position: e.position });
  };
  const onImpact = (e: SfxBusEvents["impact"]): void => {
    playEvent(impactIdFor(e.material), { position: e.position });
  };
  const onExplosion = (e: SfxBusEvents["explosion"]): void => {
    playEvent("explosion", { position: e.position });
  };
  const onVehicle = (e: SfxBusEvents["vehicle"]): void => {
    playEvent(VEHICLE_ID[e.kind], { position: e.position });
  };
  const onUi = (e: SfxBusEvents["ui"]): void => {
    playEvent(UI_ID[e.kind]);
  };
  const onPickup = (e: SfxBusEvents["pickup"]): void => {
    playEvent(PICKUP_ID[e.kind], { position: e.position });
  };
  const onWanted = (e: SfxBusEvents["wanted"]): void => {
    if (e.level > lastWanted) playEvent("wanted_up");
    else if (e.level < lastWanted) playEvent("wanted_down");
    lastWanted = e.level;
  };
  const onMission = (e: SfxBusEvents["mission"]): void => {
    playEvent(
      e.phase === "start" ? "mission_start" : e.phase === "complete" ? "mission_complete" : "mission_failed",
    );
  };

  sfxBus.on("play", onPlay);
  sfxBus.on("gunfire", onGunfire);
  sfxBus.on("reload", onReload);
  sfxBus.on("impact", onImpact);
  sfxBus.on("explosion", onExplosion);
  sfxBus.on("vehicle", onVehicle);
  sfxBus.on("ui", onUi);
  sfxBus.on("pickup", onPickup);
  sfxBus.on("wanted", onWanted);
  sfxBus.on("mission", onMission);

  // Zero-wiring UI feedback: react to obvious UI-store transitions.
  const unsubUi = useUiStore.subscribe((state, prev) => {
    if (state.weaponWheelOpen !== prev.weaponWheelOpen) {
      playEvent(state.weaponWheelOpen ? "ui_open" : "ui_close");
    }
    if (state.mapOpen !== prev.mapOpen) {
      playEvent(state.mapOpen ? "ui_open" : "ui_close");
    }
    if (state.interactionMenuOpen !== prev.interactionMenuOpen) {
      playEvent(state.interactionMenuOpen ? "ui_open" : "ui_close");
    }
    if (state.phone.open !== prev.phone.open) {
      playEvent(state.phone.open ? "phone_ring" : "ui_close");
    }
    if (state.activeMenu !== prev.activeMenu) {
      playEvent(state.activeMenu ? (prev.activeMenu ? "ui_click" : "ui_open") : "ui_close");
    }
    if (state.toasts.length > prev.toasts.length) {
      playEvent("notification");
    }
  });

  // Persisted audio settings -> bus volumes (apply now, on change, and after a backend swap).
  applyVolumes(useSettingsStore.getState().audio);
  const unsubSettings = useSettingsStore.subscribe((state, prev) => {
    if (state.audio !== prev.audio) applyVolumes(state.audio);
  });
  const unsubBackend = onBackendChange(() => applyVolumes(useSettingsStore.getState().audio));

  return () => {
    sfxBus.off("play", onPlay);
    sfxBus.off("gunfire", onGunfire);
    sfxBus.off("reload", onReload);
    sfxBus.off("impact", onImpact);
    sfxBus.off("explosion", onExplosion);
    sfxBus.off("vehicle", onVehicle);
    sfxBus.off("ui", onUi);
    sfxBus.off("pickup", onPickup);
    sfxBus.off("wanted", onWanted);
    sfxBus.off("mission", onMission);
    unsubUi();
    unsubSettings();
    unsubBackend();
  };
}
