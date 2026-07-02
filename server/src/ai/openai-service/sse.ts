// Server-Sent Events plumbing shared by the dialogue route. Wire format (per AiStreamEvent):
//   data: {json}\n\n           ← one event
//   : ping\n\n                 ← heartbeat comment (ignored by parsers)
// The stream ends with a `done` event and res.end() (no `[DONE]` sentinel).

import type { Response } from "express";
import type { AiStreamEvent, AiSource, AiUsage } from "./types";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function initSSE(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable proxy buffering (nginx)
  res.flushHeaders?.();
}

export function writeEvent(res: Response, event: AiStreamEvent): void {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function writeHeartbeat(res: Response): void {
  if (res.writableEnded) return;
  res.write(`: ping\n\n`);
}

/** Start a keep-alive heartbeat; returns a stop() to clear it. */
export function startHeartbeat(res: Response, everyMs = 15_000): () => void {
  const id = setInterval(() => writeHeartbeat(res), everyMs);
  return () => clearInterval(id);
}

/** Split text into small delta chunks (2 words each) preserving whitespace. */
function chunk(text: string): string[] {
  const tokens = text.match(/\S+\s*/g) ?? [text];
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    out.push(tokens.slice(i, i + 2).join(""));
  }
  return out.length ? out : [text];
}

/**
 * Emit a cached/offline string as a simulated token stream so the client code path is identical
 * to a live call. Stops early if the client disconnects. Emits `meta` (if provided), `delta`s,
 * then `done`.
 */
export async function replay(
  res: Response,
  text: string,
  source: AiSource,
  opts: { meta?: Extract<AiStreamEvent, { type: "meta" }>; usage?: AiUsage; perChunkMs?: number } = {},
): Promise<void> {
  if (opts.meta) writeEvent(res, opts.meta);
  const delay = opts.perChunkMs ?? 14;
  for (const piece of chunk(text)) {
    if (res.writableEnded) return;
    writeEvent(res, { type: "delta", text: piece });
    if (delay > 0) await sleep(delay);
  }
  writeEvent(res, { type: "done", text, source, usage: opts.usage });
}
