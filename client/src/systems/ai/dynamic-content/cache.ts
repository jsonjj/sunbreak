// ─────────────────────────────────────────────────────────────────────────────
// Client content cache — persist packs + runtime results across sessions
// ─────────────────────────────────────────────────────────────────────────────
// Two jobs:
//   1. Persist the merged content bundle so a returning player boots instantly and
//      offline, even if the server is unreachable this session.
//   2. Cache individual runtime-generated results by content key (with a TTL) so a
//      repeated request is free and instant.
// Storage is localStorage (small JSON, synchronous, universally available). The
// spec's IndexedDB upgrade is a drop-in behind this same interface later. Every
// entry is namespaced by CACHE_VERSION + schema/prompt versions, so bumping any of
// them transparently invalidates stale data.

import { CACHE_NAMESPACE, CACHE_VERSION, PROMPT_VERSION, SCHEMA_VERSION } from "./contract/content-keys";
import type { AuthoredContent } from "./packs";

const PREFIX = `${CACHE_NAMESPACE}.v${CACHE_VERSION}`;
const BUNDLE_KEY = `${PREFIX}.bundle`;
const RESULT_PREFIX = `${PREFIX}.result.`;

/** Runtime result TTL: long, since generated content is stable, but not forever. */
const RESULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Safe handle to localStorage (undefined in SSR / privacy-locked contexts). */
function store(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

interface VersionStamp {
  schemaVersion: string;
  promptVersion: string;
}

function versionOk(v: VersionStamp | undefined): boolean {
  return v?.schemaVersion === SCHEMA_VERSION && v?.promptVersion === PROMPT_VERSION;
}

interface BundleEnvelope extends VersionStamp {
  ts: number;
  content: AuthoredContent;
}

export function readBundle(): AuthoredContent | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(BUNDLE_KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as BundleEnvelope;
    if (!versionOk(env)) {
      s.removeItem(BUNDLE_KEY);
      return null;
    }
    return env.content ?? null;
  } catch {
    return null;
  }
}

export function writeBundle(content: AuthoredContent): void {
  const s = store();
  if (!s) return;
  const env: BundleEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    promptVersion: PROMPT_VERSION,
    ts: Date.now(),
    content,
  };
  try {
    s.setItem(BUNDLE_KEY, JSON.stringify(env));
  } catch {
    // Quota exceeded or blocked — non-fatal; bundle simply won't persist.
  }
}

interface ResultEnvelope<T> extends VersionStamp {
  ts: number;
  value: T;
}

export function readResult<T>(key: string): T | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(RESULT_PREFIX + key);
    if (!raw) return null;
    const env = JSON.parse(raw) as ResultEnvelope<T>;
    if (!versionOk(env) || Date.now() - env.ts > RESULT_TTL_MS) {
      s.removeItem(RESULT_PREFIX + key);
      return null;
    }
    return env.value;
  } catch {
    return null;
  }
}

export function writeResult<T>(key: string, value: T): void {
  const s = store();
  if (!s) return;
  const env: ResultEnvelope<T> = {
    schemaVersion: SCHEMA_VERSION,
    promptVersion: PROMPT_VERSION,
    ts: Date.now(),
    value,
  };
  try {
    s.setItem(RESULT_PREFIX + key, JSON.stringify(env));
  } catch {
    // Non-fatal.
  }
}

/** Wipe every cache entry in this namespace (debug panel "clear cache"). */
export function clearAll(): void {
  const s = store();
  if (!s) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX)) doomed.push(k);
    }
    for (const k of doomed) s.removeItem(k);
  } catch {
    // Non-fatal.
  }
}
