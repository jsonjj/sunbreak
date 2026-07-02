// Usage → estimated USD. Prices change often, so this is a small table with a conservative
// fallback and env overrides (AI_PRICE_INPUT_PER_M / AI_PRICE_OUTPUT_PER_M). Cost is only an
// ESTIMATE used to enforce budget caps — it never needs to be exact, only safely close.

import { config } from "./config";
import type { AiUsage } from "./types";

/** USD per 1,000,000 tokens. `cachedIn` applies to prompt-cache-hit input tokens. */
interface Price {
  in: number;
  out: number;
  cachedIn: number;
}

// Substring-matched (longest match wins) so future dated snapshots still resolve.
const TABLE: ReadonlyArray<readonly [string, Price]> = [
  ["gpt-4o-mini", { in: 0.15, out: 0.6, cachedIn: 0.075 }],
  ["gpt-4o", { in: 2.5, out: 10, cachedIn: 1.25 }],
  ["gpt-4.1-mini", { in: 0.4, out: 1.6, cachedIn: 0.1 }],
  ["gpt-4.1-nano", { in: 0.1, out: 0.4, cachedIn: 0.025 }],
  ["gpt-4.1", { in: 2.0, out: 8, cachedIn: 0.5 }],
  ["gpt-5-nano", { in: 0.05, out: 0.4, cachedIn: 0.005 }],
  ["gpt-5-mini", { in: 0.25, out: 2, cachedIn: 0.025 }],
  ["gpt-5", { in: 1.25, out: 10, cachedIn: 0.125 }],
  ["o4-mini", { in: 1.1, out: 4.4, cachedIn: 0.275 }],
];

/** Conservative default when a model is unknown (bias high so budgets fail safe). */
const DEFAULT_PRICE: Price = { in: 1.0, out: 5.0, cachedIn: 0.5 };

function priceFor(model: string): Price {
  if (config.priceInputPerM !== undefined || config.priceOutputPerM !== undefined) {
    const inP = config.priceInputPerM ?? DEFAULT_PRICE.in;
    const outP = config.priceOutputPerM ?? DEFAULT_PRICE.out;
    return { in: inP, out: outP, cachedIn: inP * 0.25 };
  }
  let best: Price | undefined;
  let bestLen = -1;
  for (const [key, price] of TABLE) {
    if (model.includes(key) && key.length > bestLen) {
      best = price;
      bestLen = key.length;
    }
  }
  return best ?? DEFAULT_PRICE;
}

/** Raw token usage as returned by the Responses API (only the bits we use). */
export interface RawUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  input_tokens_details?: { cached_tokens?: number | null } | null;
}

/** Build a normalized {@link AiUsage} (tokens + estimated USD) from raw API usage. */
export function estimateUsage(model: string, raw: RawUsage | null | undefined): AiUsage {
  const inputTokens = Math.max(0, raw?.input_tokens ?? 0);
  const outputTokens = Math.max(0, raw?.output_tokens ?? 0);
  const cachedTokens = Math.max(0, raw?.input_tokens_details?.cached_tokens ?? 0);
  const p = priceFor(model);
  const freshInput = Math.max(0, inputTokens - cachedTokens);
  const costUsd =
    (freshInput * p.in + cachedTokens * p.cachedIn + outputTokens * p.out) / 1_000_000;
  return { model, inputTokens, outputTokens, cachedTokens, costUsd };
}

/** Rough pre-flight cost of a would-be call, for budget gating before we spend. */
export function estimateMaxCost(model: string, promptChars: number, maxOutTokens: number): number {
  const p = priceFor(model);
  const approxInTokens = Math.ceil(promptChars / 4); // ~4 chars/token
  return (approxInTokens * p.in + maxOutTokens * p.out) / 1_000_000;
}
