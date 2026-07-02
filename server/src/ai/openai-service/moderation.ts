// Optional input moderation on untrusted player free-text using OpenAI's FREE
// omni-moderation-latest. Flagged input is routed to a fallback line (never sent to the model).
// Fails OPEN on network/API errors so an outage degrades safety, not availability — explicit
// `flagged: true` from the API is always respected.

import { config, isOffline } from "./config";
import { getOpenAI } from "./openai-client";
import type { ModerationResult } from "./types";

export async function moderate(text: string): Promise<ModerationResult> {
  const trimmed = text.trim();
  if (!trimmed || !config.moderationEnabled || isOffline()) {
    return { flagged: false, categories: [] };
  }
  const client = getOpenAI();
  if (!client) return { flagged: false, categories: [] };

  try {
    const res = await client.moderations.create({
      model: "omni-moderation-latest",
      input: trimmed.slice(0, 4000),
    });
    const result = res.results[0];
    if (!result) return { flagged: false, categories: [] };
    const categories = Object.entries(result.categories ?? {})
      .filter(([, on]) => on === true)
      .map(([name]) => name);
    return { flagged: Boolean(result.flagged), categories };
  } catch {
    // Fail open: availability over strictness (the guardrail system prompt still applies).
    return { flagged: false, categories: [] };
  }
}
