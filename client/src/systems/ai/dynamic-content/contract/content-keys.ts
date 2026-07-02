// ─────────────────────────────────────────────────────────────────────────────
// Content identity: stable cache keys, IDs, provenance, and the ContentPack shape
// ─────────────────────────────────────────────────────────────────────────────
// A cache key is a deterministic function of everything that can change the
// output: the content type, the request params, the seed, and the versions of the
// prompt + schema + model. Bump a version and every dependent key changes, so a
// stale cache can never serve content produced under old rules.

import type { ContentType } from "./schemas";

/** Bump when the Zod schemas change shape (invalidates persisted packs + keys). */
export const SCHEMA_VERSION = "1.0.0";

/** Bump when prompt templates change (server-owned; mirrored here for key parity). */
export const PROMPT_VERSION = "2026.07.01";

/** Persisted-cache namespace + version (bump to drop all client-cached packs). */
export const CACHE_NAMESPACE = "sunbreak.ai.dynamic-content";
export const CACHE_VERSION = 1;

export type ContentSource = "authored" | "generated" | "runtime";

export interface Provenance {
  source: ContentSource;
  /** Model snapshot that produced it (null for authored/handwritten). */
  model: string | null;
  /** Epoch ms when produced/loaded. */
  ts: number;
  promptVersion: string;
  schemaVersion: string;
  /** Deterministic seed used, when applicable. */
  seed: string | null;
}

/** A validated, provenance-tagged bundle of one content type's items. */
export interface ContentPack<T> {
  type: ContentType;
  version: string;
  provenance: Provenance;
  items: T[];
}

export function makeProvenance(p: Partial<Provenance> & { source: ContentSource }): Provenance {
  return {
    source: p.source,
    model: p.model ?? null,
    ts: p.ts ?? Date.now(),
    promptVersion: p.promptVersion ?? PROMPT_VERSION,
    schemaVersion: p.schemaVersion ?? SCHEMA_VERSION,
    seed: p.seed ?? null,
  };
}

// --- Deterministic hashing ---------------------------------------------------

/** Deterministic JSON: object keys sorted recursively so key order never matters. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** 32-bit FNV-1a as 8 hex chars. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Sync 64-bit-ish hex hash (two independent FNV passes). Good enough for a cache
 *  key; the server uses SHA-256 for its own store — the two never need to match. */
export function hash64(str: string): string {
  const a = fnv1a(str);
  const b = fnv1a(`\u0001${str}\u0002`);
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

export interface ContentKeyInput {
  type: ContentType;
  params: Record<string, unknown>;
  seed?: string | null;
  model?: string | null;
}

/** Stable content key = hash of {type, params, seed, prompt+schema versions, model}. */
export function contentKey(input: ContentKeyInput): string {
  const canonical = stableStringify({
    type: input.type,
    params: input.params,
    seed: input.seed ?? null,
    model: input.model ?? null,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
  });
  return `${input.type}_${hash64(canonical)}`;
}

/** Async SHA-256 key (hex) for parity with the server when needed. Falls back to
 *  the sync hash where WebCrypto is unavailable. */
export async function sha256Key(input: ContentKeyInput): Promise<string> {
  const canonical = stableStringify({
    type: input.type,
    params: input.params,
    seed: input.seed ?? null,
    model: input.model ?? null,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
  });
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return `${input.type}_${hash64(canonical)}`;
  const bytes = new TextEncoder().encode(canonical);
  const digest = await subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${input.type}_${hex}`;
}

/** Short, collision-resistant id with a type prefix (no external dep). */
export function newId(prefix: string): string {
  const rand = globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 12);
  const fallback = Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4);
  return `${prefix}_${rand ?? fallback}`;
}
