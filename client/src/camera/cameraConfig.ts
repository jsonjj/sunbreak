export interface CameraProfile {
  distance: number;
  height: number;
  shoulder: number;
  fov: number;
  smoothTime: number;
  pitchMin: number;
  pitchMax: number;
  sensScale: number;
}

/** v0 third-person follow profile. Aim/FP/vehicle profiles arrive with the camera subsystem. */
export const THIRD_PERSON: CameraProfile = {
  distance: 4.5,
  height: 1.6,
  shoulder: 0,
  fov: 60,
  smoothTime: 0.18,
  pitchMin: -0.6,
  pitchMax: 1.1,
  sensScale: 1,
};
