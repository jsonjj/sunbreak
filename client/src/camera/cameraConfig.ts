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

/** Third-person follow profile (default on-foot + vehicle). */
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

/** Over-the-shoulder aim profile (hold RMB / InputAction.Aim): pulled in, offset right, tighter FOV. */
export const AIM: CameraProfile = {
  distance: 2.0,
  height: 1.55,
  shoulder: 0.65,
  fov: 50,
  smoothTime: 0.1,
  pitchMin: -0.7,
  pitchMax: 1.2,
  sensScale: 0.75,
};

/** First-person profile (toggle with InputAction.FirstPerson): eye-mounted, no boom. `height` is the
 *  eye offset above the capsule CENTER (the near-plane clips the player's own head at this distance). */
export const FIRST_PERSON: CameraProfile = {
  distance: 0,
  height: 0.68,
  shoulder: 0,
  fov: 74,
  smoothTime: 0.05,
  pitchMin: -1.2,
  pitchMax: 1.3,
  sensScale: 1,
};
