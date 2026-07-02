// CSM-free custom-shader injection.
//
// The spec calls for `three-custom-shader-material` (CSM), but it is NOT installed in this repo
// (and can't be added mid-wave). CSM is a thin wrapper over three's own `onBeforeCompile`, so we
// inject the SAME isolated GLSL chunks that way directly. This keeps full PBR lighting, shadows and
// postprocessing compatibility, shares the global uniform bus by reference, and — crucially — sets
// a stable `customProgramCacheKey` so N materials of the same master de-dupe to ONE GPU program.
import type * as THREE from "three";
import type { MasterOptions } from "../types";
import { globalUniforms } from "../globalUniforms";
import {
  matUniformDeclFrag,
  matUniformDeclVert,
  matWorldCaptureVert,
} from "../chunks/uniforms.glsl";

/** Per-material (instance-level) uniforms. Kept separate from the shared global bus. */
export interface PerMaterialUniforms {
  uPuddleFactor: THREE.IUniform<number>;
  uPorosity: THREE.IUniform<number>;
  uEmissiveBoost: THREE.IUniform<number>;
}

export interface InjectSpec {
  /** Stable program-cache suffix. Materials sharing a key + base params share one compiled program. */
  key: string;
  perMaterial: PerMaterialUniforms;
  /** Fragment fn defs appended after the uniform decls (e.g. wetness helpers). */
  fragFns?: string;
  /** Vertex fn defs appended after the uniform decls (e.g. wind). */
  vertFns?: string;
  /** Injected after `#include <color_fragment>` (modify `diffuseColor`). */
  afterColor?: string;
  /** Injected after `#include <roughnessmap_fragment>` (modify `roughnessFactor`). */
  afterRoughness?: string;
  /** Injected after `#include <emissivemap_fragment>` (modify `totalEmissiveRadiance`). */
  afterEmissive?: string;
  /** Injected after `#include <begin_vertex>` (modify `transformed`), runs before world capture. */
  windVertex?: string;
}

function insertAfterInclude(src: string, name: string, code: string): string {
  const token = `#include <${name}>`;
  // No-op if a given material happens not to include that chunk — keeps injection crash-proof.
  return src.includes(token) ? src.replace(token, `${token}\n${code}`) : src;
}

/**
 * Wire custom GLSL + the shared uniform bus into a base PBR material. Returns the same material.
 * Works on MeshStandardMaterial and MeshPhysicalMaterial (physical extends standard's chunks).
 */
export function injectMaterial<T extends THREE.Material>(material: T, spec: InjectSpec): T {
  material.onBeforeCompile = (shader) => {
    // Share the global bus by reference; add this material's instance knobs.
    Object.assign(shader.uniforms, globalUniforms, spec.perMaterial);

    // Fragment: declarations + fn defs, then the value hooks.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>\n${matUniformDeclFrag}\n${spec.fragFns ?? ""}`,
    );
    if (spec.afterColor) {
      shader.fragmentShader = insertAfterInclude(shader.fragmentShader, "color_fragment", spec.afterColor);
    }
    if (spec.afterRoughness) {
      shader.fragmentShader = insertAfterInclude(shader.fragmentShader, "roughnessmap_fragment", spec.afterRoughness);
    }
    if (spec.afterEmissive) {
      shader.fragmentShader = insertAfterInclude(shader.fragmentShader, "emissivemap_fragment", spec.afterEmissive);
    }

    // Vertex: declarations + fn defs, then wind (optional) + world-space capture.
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>\n${matUniformDeclVert}\n${spec.vertFns ?? ""}`,
    );
    const vtx = `${spec.windVertex ?? ""}\n${matWorldCaptureVert}`;
    shader.vertexShader = insertAfterInclude(shader.vertexShader, "begin_vertex", vtx);

    material.userData.matShader = shader;
  };

  // Without this, onBeforeCompile-modified materials can needlessly recompile / fail to share
  // programs. A stable key per master variant keeps program (PSO) count low → fewer hitches.
  material.customProgramCacheKey = () => `sunbreak-mat:${spec.key}`;
  material.needsUpdate = true;
  return material;
}

/** Build the standard trio of per-material uniforms from resolved options. */
export function makePerMaterial(opts: MasterOptions): PerMaterialUniforms {
  return {
    uPuddleFactor: { value: opts.puddleFactor ?? 1 },
    uPorosity: { value: opts.porosity ?? 1 },
    uEmissiveBoost: { value: opts.emissiveBoost ?? 1 },
  };
}
