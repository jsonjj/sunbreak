// The single listener authority. Exactly ONE spatial system drives Howler's global listener —
// we deliberately do NOT also attach a THREE.AudioListener to the camera (two systems = double
// CPU + phase issues). Position/orientation are pushed to `Howler.pos/orientation`.
import { Howler } from "howler";

const position: [number, number, number] = [0, 0, 0];
const forward: [number, number, number] = [0, 0, -1];
const up: [number, number, number] = [0, 1, 0];

// When the optional <AudioListenerRig/> (camera-driven) is mounted, it takes over the listener
// and the ECS listener system stands down to avoid two writers fighting each frame.
let cameraRigActive = false;
export function setCameraListenerActive(active: boolean): void {
  cameraRigActive = active;
}
export function isCameraListenerActive(): boolean {
  return cameraRigActive;
}

/** Set + immediately apply the listener transform. Orientation vectors need not be normalized. */
export function setListener(
  px: number,
  py: number,
  pz: number,
  fx: number,
  fy: number,
  fz: number,
  ux = 0,
  uy = 1,
  uz = 0,
): void {
  position[0] = px;
  position[1] = py;
  position[2] = pz;
  forward[0] = fx;
  forward[1] = fy;
  forward[2] = fz;
  up[0] = ux;
  up[1] = uy;
  up[2] = uz;
  applyListener();
}

/** Push the current listener transform to Howler (no-op until the AudioContext exists). */
export function applyListener(): void {
  if (!Howler.ctx) return;
  Howler.pos(position[0], position[1], position[2]);
  Howler.orientation(forward[0], forward[1], forward[2], up[0], up[1], up[2]);
}

export function getListenerPosition(): readonly [number, number, number] {
  return position;
}

/** Squared distance from the listener to a point (cheap — avoids the sqrt for comparisons). */
export function distanceSqToListener(p: readonly [number, number, number]): number {
  const dx = p[0] - position[0];
  const dy = p[1] - position[1];
  const dz = p[2] - position[2];
  return dx * dx + dy * dy + dz * dz;
}

export function distanceToListener(p: readonly [number, number, number]): number {
  return Math.sqrt(distanceSqToListener(p));
}
