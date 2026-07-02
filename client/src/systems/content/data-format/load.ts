// content/data-format — validated loaders.
//
// The single place other subsystems (or a future validate CLI / editor) turn raw JSON/objects
// into typed, validated content. Two styles:
//   • per-kind helpers: `parseMap` / `safeParseMap`, `parseVehicle`, … (throwing + safe)
//   • kind-dispatched:   `parseContent(kind, raw)` / `safeParseContent(kind, raw)` and
//     `detectKind` / `parseUnknown` that read the `schema` discriminant.
// `loadJsonContent()` discovers `./content/**/*.json` via Vite glob and registers each doc.
import type { z } from "zod";
import {
  CONTENT_SCHEMAS,
  type ContentKind,
  type ContentOf,
  KIND_BY_SCHEMA_ID,
  MapChunk,
  Mission,
  Npc,
  Vehicle,
  Weapon,
} from "./schemas";
import { registerContent } from "./registry";

export interface ContentIssue {
  path: string;
  message: string;
  code?: string;
}

export type LoadResult<T> =
  | { success: true; data: T }
  | { success: false; issues: ContentIssue[] };

/** Flatten a `ZodError` into `{ path, message, code }[]` (path joined with `.`). */
export const formatIssues = (error: z.ZodError): ContentIssue[] =>
  error.issues.map((i) => ({ path: i.path.join("."), message: i.message, code: i.code }));

const toResult = <T>(r: z.SafeParseReturnType<unknown, T>): LoadResult<T> =>
  r.success ? { success: true, data: r.data } : { success: false, issues: formatIssues(r.error) };

// ── Kind-dispatched ────────────────────────────────────────────────────────────
/** Validate `raw` against the schema for `kind`. Throws `ZodError` on failure. */
export const parseContent = <K extends ContentKind>(kind: K, raw: unknown): ContentOf<K> =>
  CONTENT_SCHEMAS[kind].parse(raw) as ContentOf<K>;

/** Safe (non-throwing) variant of {@link parseContent}. */
export const safeParseContent = <K extends ContentKind>(
  kind: K,
  raw: unknown,
): LoadResult<ContentOf<K>> =>
  toResult(CONTENT_SCHEMAS[kind].safeParse(raw) as z.SafeParseReturnType<unknown, ContentOf<K>>);

/** Read the `schema` discriminant off a document to infer its kind (or `undefined`). */
export const detectKind = (raw: unknown): ContentKind | undefined => {
  if (raw && typeof raw === "object" && "schema" in raw) {
    const s = (raw as { schema?: unknown }).schema;
    if (typeof s === "string") return KIND_BY_SCHEMA_ID[s];
  }
  return undefined;
};

/** Detect kind from `schema`, then validate. Throws if kind can't be detected or is invalid. */
export const parseUnknown = (
  raw: unknown,
): { kind: ContentKind; data: ContentOf<ContentKind> } => {
  const kind = detectKind(raw);
  if (!kind) {
    throw new Error("[content/data-format] cannot detect content kind: missing/unknown 'schema'");
  }
  return { kind, data: parseContent(kind, raw) };
};

/** Safe variant of {@link parseUnknown}. */
export const safeParseUnknown = (
  raw: unknown,
): LoadResult<ContentOf<ContentKind>> & { kind?: ContentKind } => {
  const kind = detectKind(raw);
  if (!kind) {
    return {
      success: false,
      issues: [{ path: "schema", message: "missing or unknown 'schema' discriminant" }],
    };
  }
  return { kind, ...safeParseContent(kind, raw) };
};

// ── Per-kind convenience (throwing + safe) ─────────────────────────────────────
export const parseMap = (raw: unknown): MapChunk => MapChunk.parse(raw);
export const safeParseMap = (raw: unknown): LoadResult<MapChunk> => toResult(MapChunk.safeParse(raw));
export const parseVehicle = (raw: unknown): Vehicle => Vehicle.parse(raw);
export const safeParseVehicle = (raw: unknown): LoadResult<Vehicle> =>
  toResult(Vehicle.safeParse(raw));
export const parseWeapon = (raw: unknown): Weapon => Weapon.parse(raw);
export const safeParseWeapon = (raw: unknown): LoadResult<Weapon> => toResult(Weapon.safeParse(raw));
export const parseNpc = (raw: unknown): Npc => Npc.parse(raw);
export const safeParseNpc = (raw: unknown): LoadResult<Npc> => toResult(Npc.safeParse(raw));
export const parseMission = (raw: unknown): Mission => Mission.parse(raw);
export const safeParseMission = (raw: unknown): LoadResult<Mission> =>
  toResult(Mission.safeParse(raw));

// ── JSON discovery (Vite) ──────────────────────────────────────────────────────
export interface JsonLoadReport {
  loaded: number;
  issues: Array<ContentIssue & { file: string }>;
}

/**
 * Discover and validate every `./content/**\/*.json` under this folder (Vite `import.meta.glob`).
 * Each valid document is registered into the in-memory registry (disable via `register:false`).
 * No-ops outside a Vite/bundler context. Lazy — JSON is fetched on demand, not eagerly bundled.
 */
export const loadJsonContent = async (options?: {
  register?: boolean;
}): Promise<JsonLoadReport> => {
  const register = options?.register ?? true;
  const report: JsonLoadReport = { loaded: 0, issues: [] };

  // `import.meta.glob` is a Vite compile-time macro — the call below is replaced at build with a
  // lazy import map. Outside a Vite/bundler context (node/tests/SSR) it doesn't exist, so the
  // whole block is wrapped in try/catch to no-op gracefully rather than throw.
  try {
    const modules = import.meta.glob("./content/**/*.json") as Record<
      string,
      () => Promise<unknown>
    >;
    for (const [file, load] of Object.entries(modules)) {
      const mod = await load();
      const raw =
        mod && typeof mod === "object" && "default" in mod
          ? (mod as { default: unknown }).default
          : mod;
      const kind = detectKind(raw);
      if (!kind) {
        report.issues.push({ file, path: "schema", message: "missing or unknown 'schema' field" });
        continue;
      }
      const res = safeParseContent(kind, raw);
      if (!res.success) {
        for (const issue of res.issues) report.issues.push({ file, ...issue });
        continue;
      }
      if (register) registerContent(kind, res.data);
      report.loaded += 1;
    }
  } catch {
    // No bundler glob available (e.g. running under node/tests) — nothing to discover.
  }
  return report;
};
