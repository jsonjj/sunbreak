// Subsystem: audio/radio (client) — diegetic in-car radio network.
// Data-driven stations + deterministic "live" broadcast clock + equal-power crossfader, routed
// through the AUDIO ENGINE's shared playback graph (audioBridge). Self-registers on import via the
// WAVE-2 contract; the ECS `radio_*` components are declared in ./radio.components.
import type { SubsystemModule } from "@sunbreak/shared";
import { registerModule } from "@/game/registry";
import { world } from "@/ecs/world";
import "./radio.components"; // load the SimComponents augmentation (side-effect)
import { initRadio, radioSystem } from "./radioSystem";

type W = typeof world;

export const radio: SubsystemModule<W> = {
  id: "audio/radio",
  systems: [radioSystem],
  init() {
    return initRadio();
  },
};

registerModule(radio);

// Public surface for the integrator / other subsystems (HUD, missions, dialogue, vehicles).
export { setRadioAudioBackend, subscribeBackend } from "./audioBridge";
export { getRadioEngine, canControlRadio } from "./radioSystem";
export { useRadioStore, selectStation } from "./radioStore";
export { STATIONS, STATION_COUNT, getStation, stationIndexOf, RADIO_ATTRIBUTION } from "./stations";
export type {
  StationDef,
  RadioElement,
  RadioCategory,
  NowPlaying,
  RadioStatus,
  RadioAudioBackend,
  RadioReceiver,
} from "./types";
