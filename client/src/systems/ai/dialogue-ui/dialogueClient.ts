// Default streaming transport: POST + ReadableStream SSE reader (the 2026 standard;
// browser `EventSource` cannot POST). Buffers, splits on the blank-line frame
// delimiter, parses `data:` payloads, zod-validates each `DialogueEvent`, and yields.
// `data: [DONE]` terminates. This is the direct client of the shared HTTP contract
// (`POST /api/dialogue/turn`, owned by the server dialogue route / OpenAI service).

import { DIALOGUE_ENDPOINT } from "./constants";
import {
  dialogueEventSchema,
  type DialogueEvent,
  type DialogueProvider,
  type DialogueTurnRequest,
} from "./contract";

/**
 * Normalize one parsed SSE payload into a `DialogueEvent`. The canonical openai-service route
 * (`/api/ai/dialogue`) emits the `{type:"meta"|"delta"|"done"|"error"}` convention; the scripted
 * engine + this contract use `{t:"meta"|"token"|…}`. Accept BOTH so the one unified route renders
 * here regardless of which convention a frame uses (INTEGRATOR unification).
 */
function normalizeFrame(parsed: unknown, req: DialogueTurnRequest): DialogueEvent | null {
  const native = dialogueEventSchema.safeParse(parsed);
  if (native.success) return native.data;
  if (typeof parsed !== "object" || parsed === null) return null;
  const r = parsed as Record<string, unknown>;
  const type = typeof r.type === "string" ? r.type : null;
  if (!type) return null;
  const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
  switch (type) {
    case "meta": {
      const sp = (typeof r.speaker === "object" && r.speaker ? r.speaker : {}) as Record<string, unknown>;
      const npcId = str(sp.npcId) ?? str(sp.id) ?? req.npcId;
      const displayName = str(sp.displayName) ?? str(sp.name) ?? npcId;
      return {
        t: "meta",
        conversationId: str(r.conversationId) ?? req.conversationId ?? npcId,
        speaker: { npcId, displayName, color: str(sp.color), emotion: str(sp.emotion) },
        mode: r.mode === "choice" ? "choice" : "input",
      };
    }
    case "delta":
    case "token": {
      const delta = str(r.text) ?? str(r.delta) ?? str(r.content);
      return delta ? { t: "token", delta } : null;
    }
    case "done":
      return { t: "done", conversationId: str(r.conversationId) ?? req.conversationId ?? req.npcId };
    case "error":
      return { t: "error", message: str(r.message) ?? "dialogue error", recoverable: r.recoverable === true };
    default:
      return null;
  }
}

export async function* streamTurn(
  req: DialogueTurnRequest,
  signal: AbortSignal,
): AsyncGenerator<DialogueEvent> {
  const res = await fetch(DIALOGUE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`dialogue ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const frames = buf.split("\n\n");
      buf = frames.pop() ?? "";

      for (const frame of frames) {
        const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const data = dataLine.slice(dataLine.indexOf(":") + 1).trim();
        if (!data) continue;
        if (data === "[DONE]") return;

        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue; // skip malformed frame, keep the stream alive
        }
        const ev = normalizeFrame(parsed, req);
        if (ev) yield ev;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* stream already errored/aborted */
    }
  }
}

/** The default provider: talks the shared SSE HTTP contract directly. */
export const httpProvider: DialogueProvider = {
  id: "http",
  streamTurn,
};
