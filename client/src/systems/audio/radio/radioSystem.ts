// ECS glue — the seam between the shared vehicle state and the RadioEngine. Each tick it reads
// whether the local player is in a vehicle (from shared `seat`/`vehicle` components, `vg_*`
// probes, or the HUD mirror), then reconciles the desired power/station/muffle into the engine and
// mirrors radio state into the ECS (`radio_receiver` / `radio_audible`) + the HUD store. It does
// NO heavy per-frame audio work — playback scheduling lives in RadioEngine's own timers.
import type { System } from "@sunbreak/shared";
import { world } from "@/ecs/world";
import type { ClientEntity } from "@/ecs/clientEntity";
import { useHudStore } from "@/stores/hud.store";
import type { RadioReceiver } from "./radio.components";
import { RadioEngine } from "./RadioEngine";
import { useRadioStore } from "./radioStore";
import { STATIONS, wrapStationIndex } from "./stations";
import { loadRadioPersistence, installRadioPersistence } from "./persistence";
import { installRadioInput } from "./input";

type W = typeof world;

// ── module singletons ────────────────────────────────────────────────────────
let engine: RadioEngine | null = null;

const players = world.with("isPlayer");
const vehicles = world.with("vehicle", "netId");

/** Edge-tracked reconcile state so we only call the engine / store on real changes. */
const st = {
  inVehicle: false,
  power: false,
  stationId: null as string | null,
  volume: -1,
  muffled: false,
  audibleMirror: false,
  audioReadyMirror: false,
};

const RATE = 1 / 15; // reconcile ~15 Hz (input/HUD-responsive; cheap)
let acc = 0;

export function getRadioEngine(): RadioEngine | null {
  return engine;
}

/** Exposed for the input module: radio controls are in-car only. */
export function canControlRadio(): boolean {
  return st.inVehicle;
}

// ── vehicle-state detection (robust to parallel vehicle-gameplay work) ─────────
interface VehicleContext {
  inVehicle: boolean;
  isDriver: boolean;
  engineOn: boolean;
  playerEntity: ClientEntity | null;
}

function localPlayer(): ClientEntity | null {
  const list = players.entities;
  if (list.length === 0) return null;
  for (const e of list) if (e.isLocal) return e;
  return list[0] ?? null;
}

function findVehicleByNetId(netId: number): ClientEntity | undefined {
  for (const v of vehicles.entities) if (v.netId === netId) return v;
  return undefined;
}

function readVehicleContext(): VehicleContext {
  const player = localPlayer();
  if (!player) return { inVehicle: false, isDriver: false, engineOn: false, playerEntity: null };

  // 1) Shared `seat` component (guaranteed contract): presence ⇒ occupant; index 0 ⇒ driver.
  const seat = player.seat;
  if (seat) {
    const veh = findVehicleByNetId(seat.vehicleNetId);
    const engineOn = veh?.vehicle ? !!veh.vehicle.engineOn : true;
    return { inVehicle: true, isDriver: seat.index === 0, engineOn, playerEntity: player };
  }

  // 2) Defensive probe of vehicle-gameplay's `vg_*` fields (schema owned by that subsystem).
  const p = player as unknown as Record<string, unknown>;
  const occ = p.vg_occupancy ?? p.vg_seat ?? p.vg_driving ?? p.vg_inVehicle;
  if (occ) {
    let isDriver = true;
    if (typeof occ === "object" && occ !== null) {
      const o = occ as { seat?: unknown; driver?: unknown };
      if (typeof o.seat === "number") isDriver = o.seat === 0;
      else if (typeof o.seat === "string") isDriver = o.seat === "driver";
      if (typeof o.driver === "boolean") isDriver = o.driver;
    }
    const engineOn = typeof p.vg_engineOn === "boolean" ? (p.vg_engineOn as boolean) : true;
    return { inVehicle: true, isDriver, engineOn, playerEntity: player };
  }

  // 3) Last-resort HUD mirror (set by the vehicle/HUD subsystems).
  if (useHudStore.getState().inVehicle) {
    return { inVehicle: true, isDriver: true, engineOn: true, playerEntity: player };
  }

  return { inVehicle: false, isDriver: false, engineOn: false, playerEntity: player };
}

// ── reconcile ─────────────────────────────────────────────────────────────────
function reconcile(): void {
  if (!engine) return;
  const store = useRadioStore.getState();
  const vc = readVehicleContext();
  st.inVehicle = vc.inVehicle;

  const station = STATIONS[wrapStationIndex(store.stationIndex)];
  const desiredPower = vc.inVehicle && store.powerPref && vc.engineOn;
  const muffled = vc.inVehicle && !vc.engineOn;

  // Volume trim (edge-triggered).
  if (store.volume !== st.volume) {
    engine.setVolume(store.volume);
    st.volume = store.volume;
  }

  // Station selection (safe to set even while unpowered — engine just stores it).
  if (station && st.stationId !== station.id) {
    engine.tune(station, true);
    st.stationId = station.id;
  }

  // Power (in-vehicle × user pref × engine running).
  if (desiredPower !== st.power) {
    engine.setPowered(desiredPower);
    st.power = desiredPower;
  }

  // Muffle when seated with the engine idle (proxy for "not really driving / windows up").
  if (muffled !== st.muffled) {
    engine.setMuffled(muffled);
    st.muffled = muffled;
  }

  // ECS mirror on the local listener entity.
  const player = vc.playerEntity;
  if (player) {
    const recv: RadioReceiver = {
      power: store.powerPref,
      stationId: station?.id ?? null,
      volume: store.volume,
      muffled,
    };
    if (!player.radio_receiver) world.addComponent(player, "radio_receiver", recv);
    else {
      player.radio_receiver.power = recv.power;
      player.radio_receiver.stationId = recv.stationId;
      player.radio_receiver.volume = recv.volume;
      player.radio_receiver.muffled = recv.muffled;
    }
    if (desiredPower && !player.radio_audible) world.addComponent(player, "radio_audible", true);
    else if (!desiredPower && player.radio_audible) world.removeComponent(player, "radio_audible");
  }

  // HUD-store mirror (edge-triggered — never write per-frame).
  if (desiredPower !== st.audibleMirror) {
    store._mirror({ audible: desiredPower });
    st.audibleMirror = desiredPower;
  }
  if (engine.audioReady !== st.audioReadyMirror) {
    store._mirror({ audioReady: engine.audioReady });
    st.audioReadyMirror = engine.audioReady;
  }
}

/** update-phase system: reconcile the radio against vehicle state at ~15 Hz. */
export const radioSystem: System<W> = {
  name: "radio",
  phase: "update",
  order: 0,
  fn: (_world, dt) => {
    acc += dt;
    if (acc < RATE) return;
    acc = 0;
    reconcile();
  },
};

// ── lifecycle (called from index.ts `init`) ────────────────────────────────────
export function initRadio(): () => void {
  engine = new RadioEngine({
    onUpdate: (nowPlaying, status) => useRadioStore.getState()._mirror({ nowPlaying, status }),
    onReady: (ready) => useRadioStore.getState()._mirror({ audioReady: ready }),
  });

  loadRadioPersistence();
  const disposePersist = installRadioPersistence();
  const disposeInput = installRadioInput(canControlRadio);

  // Unlock the shared audio context on user gestures (autoplay policy). Keep listening until the
  // context is actually running (it may not exist until the radio is first powered in a vehicle).
  const gestures: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
  const removeGesture = () => gestures.forEach((g) => window.removeEventListener(g, unlock));
  const unlock = () => {
    void engine?.unlock();
    if (engine?.audioReady) removeGesture();
  };
  gestures.forEach((g) => window.addEventListener(g, unlock, { passive: true }));

  return () => {
    removeGesture();
    disposeInput();
    disposePersist();
    engine?.dispose();
    engine = null;
  };
}
