// content/data-format — shared primitive schemas.
//
// These are the low-level building blocks every content schema reuses: spatial tuples,
// ids, asset references, colors, transforms, and the "envelope" fields (schema tag +
// version + id) that live on every top-level content document so we can migrate later.
//
// Design rule (WAVE-2): keep everything PERMISSIVE so ~36 sibling subsystems can author
// their own content without being blocked. Prefer tuples over {x,y,z} (matches
// Three/Rapier array APIs and shrinks JSON), lean on `.default()`/`.optional()`, and
// `.passthrough()` on objects so sibling-authored extra fields survive validation.
import { z } from "zod";

/** Bumped when a schema shape changes in a way that needs a migration on load. */
export const SCHEMA_VERSION = 1;

// ── Spatial ──────────────────────────────────────────────────────────────────
/** `[x, y, z]` — world position / scale / euler-in-degrees, tuple form. */
export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
/** `[x, y]` — planar footprint point (XZ) for polygons/zones. */
export const Vec2 = z.tuple([z.number(), z.number()]);
/** `[x, y, z, w]` — quaternion. */
export const Quat = z.tuple([z.number(), z.number(), z.number(), z.number()]);
/** `[x, y, z]` euler in DEGREES (authoring-friendly; convert to rad at consume time). */
export const EulerDeg = z.tuple([z.number(), z.number(), z.number()]);

export type Vec3 = z.infer<typeof Vec3>;
export type Vec2 = z.infer<typeof Vec2>;
export type Quat = z.infer<typeof Quat>;
export type EulerDeg = z.infer<typeof EulerDeg>;

// ── Identity & references ─────────────────────────────────────────────────────
/**
 * Canonical id convention: `<prefix>_<slug>` e.g. `veh_reyes-convertible`, `mission_intro`.
 * Exported for tooling/ref-integrity — the runtime `Id` schema below is intentionally
 * lenient (non-empty string) so a sibling using an off-convention id is never blocked.
 */
export const ID_PATTERN = /^[a-z][a-z0-9]*_[a-z0-9._-]+$/;
/** Lenient id used inside schemas (non-empty string). */
export const Id = z.string().min(1);
/** Strict, convention-enforcing id — use in CLI/editor validation, not in shared schemas. */
export const StrictId = z.string().regex(ID_PATTERN, "id must match <prefix>_<slug>");
/** True if `id` follows the `<prefix>_<slug>` convention. */
export const isValidId = (id: string): boolean => ID_PATTERN.test(id);

/** Recognised asset extensions (models, textures, audio, data). */
export const ASSET_REF_PATTERN = /\.(glb|gltf|fbx|obj|png|jpe?g|webp|ktx2|hdr|exr|mp3|ogg|wav|json)$/i;
/** Lenient asset reference (non-empty path); broadened from the spec so no sibling is blocked. */
export const AssetRef = z.string().min(1);
/** Strict asset reference for tooling — enforces a known extension. */
export const StrictAssetRef = z.string().regex(ASSET_REF_PATTERN, "unsupported asset extension");

/** `#rgb`, `#rrggbb`, or `#rrggbbaa`. */
export const HexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "expected hex color");

export type Id = z.infer<typeof Id>;
export type AssetRef = z.infer<typeof AssetRef>;
export type HexColor = z.infer<typeof HexColor>;

// ── Transform ─────────────────────────────────────────────────────────────────
/** Position + euler(deg) + scale. Every field defaults, so `{}` is a valid transform. */
export const Transform = z
  .object({
    pos: Vec3.default([0, 0, 0]),
    rotDeg: EulerDeg.default([0, 0, 0]),
    scale: Vec3.default([1, 1, 1]),
  })
  .passthrough();
export type Transform = z.infer<typeof Transform>;

/** Axis-aligned bounds used for chunk streaming / culling. */
export const Bounds = z.object({ min: Vec3, max: Vec3 }).passthrough();
export type Bounds = z.infer<typeof Bounds>;

// ── Envelope ──────────────────────────────────────────────────────────────────
/**
 * Builds a top-level content object schema with the shared envelope fields mixed in:
 * a `schema` discriminant literal (defaulted, so authors may omit it), a `schemaVersion`
 * (defaulted to {@link SCHEMA_VERSION}), and a required `id`. Result is `.passthrough()`.
 */
export const withEnvelope = <S extends string, T extends z.ZodRawShape>(schema: S, shape: T) =>
  z
    .object({
      schema: z.literal(schema).default(schema),
      schemaVersion: z.number().int().nonnegative().default(SCHEMA_VERSION),
      id: Id,
    })
    .extend(shape)
    .passthrough();
