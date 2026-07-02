// Lazy OpenAI client singleton. Returns null whenever there is no key — that null is what
// drives the whole offline path, so nothing downstream ever needs to touch the key directly.

import OpenAI from "openai";
import { config } from "./config";

let client: OpenAI | null = null;
let builtForKey: string | null = null;

/** The OpenAI client, or null if no key is configured. Rebuilds if the key changed at boot. */
export function getOpenAI(): OpenAI | null {
  if (!config.hasKey || !config.apiKey) {
    client = null;
    builtForKey = null;
    return null;
  }
  if (!client || builtForKey !== config.apiKey) {
    client = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.requestTimeoutMs,
      maxRetries: 1,
    });
    builtForKey = config.apiKey;
  }
  return client;
}
