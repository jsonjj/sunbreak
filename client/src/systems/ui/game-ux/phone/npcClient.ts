// Streaming client for the NPC-chat proxy. Speaks the spec's SSE shape (`data: {"delta": "..."}`
// ... `data: [DONE]`), but degrades gracefully: if the endpoint is missing / returns JSON /
// throws (no server, no OPENAI_API_KEY), it streams a persona canned reply so the phone always
// works standalone. The server route (`server/src/routes/npc.ts`) is a joint v3 deliverable.
import { cannedReply } from "./personas";

export type ChatRole = "system" | "user" | "assistant";
export interface ChatMsg {
  role: ChatRole;
  content: string;
}

const ENDPOINT = "/api/npc/chat";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function* chunkText(text: string, humanize: boolean): AsyncGenerator<string> {
  const words = text.split(/(\s+)/);
  for (const w of words) {
    if (humanize && w.trim()) await sleep(26 + Math.random() * 42);
    yield w;
  }
}

async function* cannedStream(npcId: string, messages: ChatMsg[]): AsyncGenerator<string> {
  const turn = Math.max(0, messages.filter((m) => m.role === "user").length - 1);
  yield* chunkText(cannedReply(npcId, turn), true);
}

/** Yields text deltas for a single assistant reply. */
export async function* streamNpc(
  npcId: string,
  messages: ChatMsg[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ npcId, messages }),
      signal,
    });
  } catch {
    yield* cannedStream(npcId, messages);
    return;
  }

  if (!res.ok || !res.body) {
    yield* cannedStream(npcId, messages);
    return;
  }

  const ctype = res.headers.get("content-type") ?? "";
  if (ctype.includes("application/json")) {
    try {
      const data = (await res.json()) as { text?: string };
      if (typeof data.text === "string" && data.text.length > 0) {
        yield* chunkText(data.text, true);
        return;
      }
    } catch {
      /* fall through to canned */
    }
    yield* cannedStream(npcId, messages);
    return;
  }

  // Server-Sent Events stream.
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const m = part.trim().match(/^data:\s?(.*)$/s);
        const payload = m?.[1];
        if (payload === undefined) continue;
        if (payload === "[DONE]") return;
        try {
          const j = JSON.parse(payload) as { delta?: string; text?: string };
          if (typeof j.delta === "string") yield j.delta;
          else if (typeof j.text === "string") yield j.text;
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
