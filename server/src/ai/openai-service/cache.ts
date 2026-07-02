// Hot in-memory response cache (lru-cache) in front of OpenAI. Only low-variety categories are
// cached (see prompts.ts `cacheable`); interactive dialogue is never cached. Keys are a sha256
// of model|system|input so identical prompts collapse to one entry. Per-entry TTL respected.

import { createHash } from "node:crypto";
import { LRUCache } from "lru-cache";
import { config } from "./config";

interface Entry {
  text: string;
  model: string;
  createdAt: number;
}

const cache = new LRUCache<string, Entry>({
  max: config.cacheMax,
  ttl: config.cacheTtlMs, // default TTL; overridden per put()
  ttlAutopurge: false,
});

export function cacheKey(model: string, system: string, input: string): string {
  return createHash("sha256").update(`${model}\u0000${system}\u0000${input}`).digest("hex");
}

export function cacheGet(key: string): string | undefined {
  return cache.get(key)?.text;
}

export function cachePut(key: string, text: string, model: string, ttlMs: number): void {
  if (!text) return;
  cache.set(key, { text, model, createdAt: Date.now() }, { ttl: ttlMs > 0 ? ttlMs : undefined });
}

export function cacheStats(): { size: number; max: number } {
  return { size: cache.size, max: cache.max };
}
