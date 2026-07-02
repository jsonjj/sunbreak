// Offline / canned-line fallback. Guarantees dialogue ALWAYS works — no key, offline,
// rate-limited, moderated, or errored — by serving persona `greeting` / `wantedReactions`
// / `fallbackLines` as a simulated token stream (so the UI path is identical to live).
import { FALLBACK_CPS } from "./config";
import type { PersonaCard, WorldSnapshot } from "./types";

const rotation = new Map<string, number>();

/** The opener line (canned by design — greetings never cost a model call). */
export function chooseGreeting(card: PersonaCard, snapshot: WorldSnapshot): string {
  const reaction = card.wantedReactions?.[snapshot.wantedLevel];
  if (snapshot.wantedLevel > 0 && reaction) return reaction;
  return card.greeting;
}

/** A canned reply for the offline path — wanted reaction if hot, else rotated fallback. */
export function chooseFallback(card: PersonaCard, snapshot: WorldSnapshot): string {
  const reaction = card.wantedReactions?.[snapshot.wantedLevel];
  if (snapshot.wantedLevel >= 2 && reaction) return reaction;

  const lines = card.fallbackLines;
  if (lines.length === 0) return card.greeting;
  const idx = (rotation.get(card.id) ?? 0) % lines.length;
  rotation.set(card.id, idx + 1);
  return lines[idx] ?? lines[0] ?? card.greeting;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Emit `text` as word-chunk "tokens" at ~FALLBACK_CPS, aborting cleanly on `signal`. */
export async function simulateStream(
  text: string,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const chunks = text.split(/(\s+)/).filter((c) => c.length > 0);
  const perChar = 1000 / Math.max(1, FALLBACK_CPS);
  for (const chunk of chunks) {
    if (signal?.aborted) return;
    onDelta(chunk);
    await sleep(Math.min(140, Math.max(12, chunk.length * perChar)));
  }
}
