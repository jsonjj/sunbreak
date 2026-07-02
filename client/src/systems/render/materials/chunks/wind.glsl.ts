// Vertex wind sway for foliage/cloth. Displaces object-space `transformed` before the world
// capture, so puddle masks and shadows follow the sway. Amplitude comes from the global uWind.

/** Function def — append to the foliage master's vertex `common` block. */
export const matWindFns = /* glsl */ `
void matApplyWind(inout vec3 pos, vec3 objPos){
  float amp = length(uWind);
  if (amp <= 0.0001) return;
  float t = uTime * 1.5;
  float phase = dot(objPos.xz, vec2(0.5));
  float mask = clamp(objPos.y * 0.3, 0.0, 1.0);       // sway grows toward the top
  pos.x += sin(t + phase) * amp * mask;
  pos.z += cos(t * 0.8 + phase) * amp * 0.6 * mask;
}
`;

/** Inject right after `#include <begin_vertex>` (before the world capture). */
export const matWindApply = /* glsl */ `
  matApplyWind(transformed, position);
`;
