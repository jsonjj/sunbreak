// Core orchestration: the single place that decides live-vs-cache-vs-offline and enforces the
// pipeline (moderation → cache → budget → OpenAI stream → record usage). Exposes both the
// SSE-driving `streamDialogue` (used by the HTTP route) and the in-process `AiService`
// (chat/chatStream/moderate/generateContent) for sibling server subsystems.

import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { ResponseCreateParamsStreaming } from "openai/resources/responses/responses";

import { config, isOffline } from "./config";
import { getOpenAI } from "./openai-client";
import { moderate } from "./moderation";
import { check, record } from "./budget";
import { cacheGet, cacheKey, cachePut } from "./cache";
import { estimateUsage, type RawUsage } from "./cost";
import { renderDialogue, contentSpec } from "./prompts";
import { speakerOf } from "./personas";
import { contentFallback, dialogueFallback } from "./fallback";
import { contentOutputSchema } from "./validation";
import { initSSE, replay, writeEvent } from "./sse";
import type {
  AiContentRequest,
  AiContentResponse,
  AiDialogueRequest,
  AiService,
  AiSource,
  AiStreamEvent,
  AiUsage,
  ChatReq,
  ChatRes,
} from "./types";

function resolveModel(m?: string): string {
  if (!m || m === "cheap") return config.model;
  if (m === "smart" || m === "balanced") return config.smartModel;
  return m;
}

function metaEvent(
  req: AiDialogueRequest,
  conversationId: string,
  source: AiSource,
  model: string,
): Extract<AiStreamEvent, { type: "meta" }> {
  const { persona } = renderDialogue(req);
  return { type: "meta", conversationId, source, model, speaker: speakerOf(persona) };
}

/**
 * Drive a full dialogue turn onto an SSE response. Always ends the stream cleanly with a `done`
 * event (live, cache, or offline) — it NEVER throws to the caller and NEVER crashes on no key.
 * Caller is responsible for `initSSE` + `res.end()` (see routes.ts) but this also inits defensively.
 */
export async function streamDialogue(
  req: AiDialogueRequest,
  res: Response,
  httpReq: Request,
): Promise<void> {
  if (!res.headersSent) initSSE(res);

  const conversationId = req.conversationId ?? randomUUID();
  const { spec, system, input } = renderDialogue(req);
  const model = config.model;

  // 1) Moderate untrusted player free-text → flagged routes to a fallback (no model call).
  if (req.playerText) {
    const mod = await moderate(req.playerText);
    if (mod.flagged) {
      await replay(res, dialogueFallback(req), "offline", {
        meta: metaEvent(req, conversationId, "offline", model),
      });
      return;
    }
  }

  // 2) Cache (only low-variety categories are cacheable).
  const key = spec.cacheable ? cacheKey(model, system, input) : undefined;
  if (key) {
    const hit = cacheGet(key);
    if (hit) {
      await replay(res, hit, "cache", { meta: metaEvent(req, conversationId, "cache", model) });
      return;
    }
  }

  // 3) Offline (no key / forced) → deterministic canned line as a simulated stream.
  if (isOffline()) {
    await replay(res, dialogueFallback(req), "offline", {
      meta: metaEvent(req, conversationId, "offline", model),
    });
    return;
  }

  // 4) Budget / rate gate → over-cap also degrades to offline (identical client path).
  if (!check(req.sessionId).ok) {
    await replay(res, dialogueFallback(req), "offline", {
      meta: metaEvent(req, conversationId, "offline", model),
    });
    return;
  }

  const client = getOpenAI();
  if (!client) {
    await replay(res, dialogueFallback(req), "offline", {
      meta: metaEvent(req, conversationId, "offline", model),
    });
    return;
  }

  // 5) LIVE stream. Abort the OpenAI request if the client disconnects (stops the spend).
  const ac = new AbortController();
  const onClose = () => ac.abort();
  httpReq.on("close", onClose);

  writeEvent(res, metaEvent(req, conversationId, "live", model));

  let full = "";
  let usage: AiUsage | undefined;
  try {
    const params: ResponseCreateParamsStreaming = {
      model,
      instructions: system,
      input,
      max_output_tokens: spec.maxTokens,
      temperature: spec.temperature,
      prompt_cache_key: req.personaId ?? req.npcId ?? undefined,
      stream: true,
    };
    const stream = await client.responses.create(params, { signal: ac.signal });
    for await (const ev of stream) {
      if (res.writableEnded) {
        stream.controller.abort();
        break;
      }
      if (ev.type === "response.output_text.delta") {
        full += ev.delta;
        writeEvent(res, { type: "delta", text: ev.delta });
      } else if (ev.type === "response.completed" || ev.type === "response.incomplete") {
        usage = estimateUsage(model, ev.response.usage as RawUsage | undefined);
      } else if (ev.type === "response.failed" || ev.type === "error") {
        throw new Error("openai_stream_failed");
      }
    }
    if (usage) record(req.sessionId, usage);
    if (key && full) cachePut(key, full, model, spec.ttlMs);
    writeEvent(res, { type: "done", text: full, source: "live", usage });
  } catch (err) {
    if (ac.signal.aborted || res.writableEnded) return; // client left; nothing to do
    if (full) {
      // Salvage partial output so the UI still ends cleanly.
      writeEvent(res, { type: "done", text: full, source: "live", usage });
    } else {
      writeEvent(res, { type: "error", message: "ai_unavailable", recoverable: true });
      await replay(res, dialogueFallback(req), "offline");
    }
  } finally {
    httpReq.off("close", onClose);
  }
}

// ── In-process API ──────────────────────────────────────────────────────────────────────

async function chat(req: ChatReq): Promise<ChatRes> {
  const model = resolveModel(req.model);
  const key = req.cacheKey
    ? cacheKey(model, "chat", JSON.stringify(req.messages))
    : undefined;
  if (key) {
    const hit = cacheGet(key);
    if (hit) return { text: hit, source: "cache" };
  }
  if (isOffline() || !getOpenAI()) return { text: "", source: "offline" };
  const sessionId = req.sessionId ?? "internal";
  if (!check(sessionId).ok) return { text: "", source: "offline" };

  const client = getOpenAI();
  if (!client) return { text: "", source: "offline" };
  try {
    const resp = await client.responses.create(
      {
        model,
        input: req.messages.map((m) => ({ role: m.role, content: m.content })),
        max_output_tokens: req.maxTokens ?? config.maxOutputTokens,
        temperature: req.temperature ?? config.temperature,
        prompt_cache_key: req.cacheKey,
      },
      { signal: req.signal },
    );
    const text = resp.output_text ?? "";
    const usage = estimateUsage(model, resp.usage as RawUsage | undefined);
    record(sessionId, usage);
    if (key && text) cachePut(key, text, model, config.cacheTtlMs);
    return { text, source: "live", usage };
  } catch {
    return { text: "", source: "offline" };
  }
}

async function* chatStream(req: ChatReq): AsyncIterable<string> {
  const model = resolveModel(req.model);
  if (isOffline()) return;
  const sessionId = req.sessionId ?? "internal";
  if (!check(sessionId).ok) return;
  const client = getOpenAI();
  if (!client) return;
  try {
    const stream = await client.responses.create(
      {
        model,
        input: req.messages.map((m) => ({ role: m.role, content: m.content })),
        max_output_tokens: req.maxTokens ?? config.maxOutputTokens,
        temperature: req.temperature ?? config.temperature,
        prompt_cache_key: req.cacheKey,
        stream: true,
      },
      { signal: req.signal },
    );
    for await (const ev of stream) {
      if (ev.type === "response.output_text.delta") {
        yield ev.delta;
      } else if (ev.type === "response.completed" || ev.type === "response.incomplete") {
        record(sessionId, estimateUsage(model, ev.response.usage as RawUsage | undefined));
      }
    }
  } catch {
    // swallow — caller falls back to its own canned lines when the stream yields nothing
  }
}

async function generateContent(req: AiContentRequest): Promise<AiContentResponse> {
  const spec = contentSpec(req.kind);
  const model = spec.useSmartModel ? config.smartModel : config.model;
  const { system, input } = spec.render(req);
  const key = spec.cacheable
    ? cacheKey(model, system, `${input}|n=${req.count ?? ""}`)
    : undefined;

  if (key) {
    const hit = cacheGet(key);
    if (hit) {
      try {
        return { ok: true, kind: req.kind, source: "cache", data: JSON.parse(hit) };
      } catch {
        /* fall through to regenerate */
      }
    }
  }

  const offlineResult = (): AiContentResponse => ({
    ok: true,
    kind: req.kind,
    source: "offline",
    data: contentFallback(req.kind, req),
  });

  if (isOffline() || !check(req.sessionId).ok) return offlineResult();
  const client = getOpenAI();
  if (!client) return offlineResult();

  try {
    const resp = await client.responses.create({
      model,
      instructions: system,
      input,
      max_output_tokens: spec.maxTokens,
      temperature: spec.temperature,
      text: { format: { type: "json_object" } },
    });
    const parsed: unknown = JSON.parse(resp.output_text ?? "{}");
    const data = contentOutputSchema(req.kind).parse(parsed);
    const usage = estimateUsage(model, resp.usage as RawUsage | undefined);
    record(req.sessionId, usage);
    if (key) cachePut(key, JSON.stringify(data), model, spec.ttlMs);
    return { ok: true, kind: req.kind, source: "live", data, usage };
  } catch {
    return offlineResult();
  }
}

/** The in-process service consumed by sibling subsystems (npc-personas, dynamic-content, …). */
export const aiService: AiService = {
  get hasKey() {
    return config.hasKey;
  },
  get offline() {
    return isOffline();
  },
  get model() {
    return config.model;
  },
  get smartModel() {
    return config.smartModel;
  },
  chat,
  chatStream,
  moderate,
  generateContent,
};
