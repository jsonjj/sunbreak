// Client for the shared server contract: POST /api/ai/dialogue (SSE). Uses native
// fetch + ReadableStream (browser EventSource cannot POST). The parser is deliberately
// LENIENT so it interops with whatever the server AI proxy emits:
//   • {type:'delta'|'done'|'error'}         (openai-service convention)
//   • {t:'token'|'meta'|'done'|'error'|…}   (dialogue-protocol convention)
//   • OpenAI chat/completions passthrough    ({choices:[{delta:{content}}]})
//   • `data: [DONE]` sentinel and bare-text deltas
// It NEVER touches the OpenAI key/SDK — that is server-only.
import { dialogueUrl } from "./config";
import type { DialogueRequest, DialogueSource, DialogueStreamEvent, PersonaView } from "./types";

/** Thrown for network/HTTP failures so the conversation layer can fall back offline. */
export class DialogueTransportError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "DialogueTransportError";
    this.status = status;
  }
}

export interface StreamController {
  iterator: AsyncGenerator<DialogueStreamEvent>;
  abort: () => void;
}

/** Open a streaming turn. Call `.abort()` to cancel (stops server tokens → stops spend). */
export function streamDialogue(req: DialogueRequest, externalSignal?: AbortSignal): StreamController {
  const ac = new AbortController();
  if (externalSignal) {
    if (externalSignal.aborted) ac.abort();
    else externalSignal.addEventListener("abort", () => ac.abort(), { once: true });
  }
  return { iterator: run(req, ac.signal), abort: () => ac.abort() };
}

async function* run(req: DialogueRequest, signal: AbortSignal): AsyncGenerator<DialogueStreamEvent> {
  let res: Response;
  try {
    res = await fetch(dialogueUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(req),
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err; // AbortError — caller distinguishes user cancel
    throw new DialogueTransportError(`network error: ${errMsg(err)}`);
  }

  if (!res.ok) throw new DialogueTransportError(`server responded ${res.status}`, res.status);
  if (!res.body) throw new DialogueTransportError("no response body (streaming unsupported)");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const FRAME_SEP = /\r?\n\r?\n/;

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(FRAME_SEP);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const ev = parseFrame(frame);
        if (ev) yield ev;
      }
    }
    const tail = buffer.trim();
    if (tail) {
      const ev = parseFrame(tail);
      if (ev) yield ev;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

// ─── SSE frame + payload parsing ─────────────────────────────────────────────────

function parseFrame(frame: string): DialogueStreamEvent | null {
  let eventName: string | null = null;
  const dataLines: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue; // blank or comment/heartbeat
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    // id:/retry: and non-SSE lines are ignored
  }
  if (dataLines.length === 0) return null;
  return interpret(dataLines.join("\n"), eventName);
}

function interpret(payload: string, eventName: string | null): DialogueStreamEvent | null {
  const trimmed = payload.trim();
  if (trimmed === "") return null;
  if (trimmed === "[DONE]") return { type: "done" };

  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return { type: "delta", text: payload }; // bare-text token
  }

  if (typeof obj === "string") return obj ? { type: "delta", text: obj } : null;
  if (typeof obj !== "object" || obj === null) return null;
  const rec = obj as Record<string, unknown>;

  // 1) {t:'…'} dialogue-protocol convention (authoritative when present).
  const t = strOf(rec.t);
  if (t) {
    switch (t) {
      case "token":
      case "delta": {
        const text = firstString(rec.delta, rec.text, rec.content);
        return text ? { type: "delta", text } : null;
      }
      case "meta":
        return metaEvent(rec);
      case "done":
        return { type: "done", text: strOf(rec.text), source: sourceOf(rec.source) };
      case "error":
        return errorEvent(rec);
      case "choices":
      case "subtitle":
        return null; // not part of the linear reply stream
      default:
        return null;
    }
  }

  // 2) {type:'…'} openai-service convention.
  const type = strOf(rec.type);
  if (type) {
    switch (type) {
      case "delta":
      case "token": {
        const text = firstString(rec.text, rec.delta, rec.content, openAiDelta(rec));
        return text ? { type: "delta", text } : null;
      }
      case "done":
        return { type: "done", text: strOf(rec.text), source: sourceOf(rec.source) };
      case "error":
        return errorEvent(rec);
      case "meta":
        return metaEvent(rec);
      default:
        return null;
    }
  }

  // 3) event-name driven ({event: done}\n{data: {...}}).
  switch (eventName) {
    case "delta":
    case "token": {
      const text = firstString(rec.text, rec.delta, rec.content, openAiDelta(rec));
      return text ? { type: "delta", text } : null;
    }
    case "done":
      return { type: "done", text: strOf(rec.text), source: sourceOf(rec.source) };
    case "error":
      return errorEvent(rec);
    case "meta":
      return metaEvent(rec);
    default:
      break;
  }

  // 4) shape inference (OpenAI passthrough / loose payloads).
  const oa = openAiDelta(rec);
  if (oa) return { type: "delta", text: oa };
  const loose = firstString(rec.delta, rec.text, rec.content);
  if (loose) return { type: "delta", text: loose };
  const err = strOf(rec.message) ?? strOf(rec.error);
  if (err) return { type: "error", message: err };
  return null;
}

function metaEvent(rec: Record<string, unknown>): DialogueStreamEvent {
  const mode = rec.mode === "input" || rec.mode === "choice" ? rec.mode : undefined;
  return {
    type: "meta",
    conversationId: strOf(rec.conversationId) ?? strOf(rec.conversation_id),
    speaker: speakerOf(rec.speaker),
    mode,
  };
}

function errorEvent(rec: Record<string, unknown>): DialogueStreamEvent {
  return {
    type: "error",
    message: strOf(rec.message) ?? strOf(rec.error) ?? "dialogue error",
    recoverable: rec.recoverable === true,
  };
}

function openAiDelta(rec: Record<string, unknown>): string | undefined {
  const choices = rec.choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const first = choices[0];
  if (typeof first !== "object" || first === null) return undefined;
  const c = first as Record<string, unknown>;
  const delta = c.delta;
  if (typeof delta === "object" && delta !== null) {
    const content = (delta as Record<string, unknown>).content;
    if (typeof content === "string") return content;
  }
  if (typeof c.text === "string") return c.text;
  return undefined;
}

function speakerOf(v: unknown): Partial<PersonaView> | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const r = v as Record<string, unknown>;
  const out: Partial<PersonaView> = {};
  const id = strOf(r.id) ?? strOf(r.npcId);
  if (id) out.id = id;
  const name = strOf(r.name) ?? strOf(r.displayName);
  if (name) out.name = name;
  const role = strOf(r.role);
  if (role) out.role = role;
  const color = strOf(r.color);
  if (color) out.color = color;
  const portrait = strOf(r.portrait);
  if (portrait) out.portrait = portrait;
  return Object.keys(out).length > 0 ? out : undefined;
}

function sourceOf(v: unknown): DialogueSource | undefined {
  return v === "live" || v === "cache" || v === "offline" ? v : undefined;
}

function strOf(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
