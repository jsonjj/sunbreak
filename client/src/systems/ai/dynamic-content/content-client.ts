// ─────────────────────────────────────────────────────────────────────────────
// content-client — the ONLY thing that talks to the server AI routes
// ─────────────────────────────────────────────────────────────────────────────
// Everything here is best-effort and non-throwing: any network/validation failure
// returns null and the caller keeps using bundled/cached content. Responses are
// re-validated with the SAME Zod schemas the server used, so a drifting server can
// never inject malformed content. Successful generations are cached by content key.

import type { z } from "zod";
import {
  AiStatusSchema,
  ContentPacksSchema,
  BarkRequestSchema,
  MissionRequestSchema,
  RadioAdRequestSchema,
  SideQuestRequestSchema,
  GENERATE_ENDPOINTS,
  STATUS_PATH,
  CONTENT_PACKS_PATH,
  endpointUrl,
  type AiStatus,
  type BarkRequest,
  type MissionRequest,
  type RadioAdRequest,
  type SideQuestRequest,
} from "./contract/endpoints";
import {
  BarkPackSchema,
  MissionSchema,
  RadioAdSchema,
  SideQuestSchema,
  type BarkPack,
  type ContentType,
  type Mission,
  type RadioAd,
  type SideQuest,
} from "./contract/schemas";
import { contentKey } from "./contract/content-keys";
import { readResult, writeResult } from "./cache";
import type { AuthoredContent } from "./packs";
import { barkPoolSize, deriveMood, useContentStore, type BarkContext } from "./contentStore";

/** Default per-request timeout so a hung server never stalls the game. */
const REQUEST_TIMEOUT_MS = 8000;

/** Refill a bark pool only when it drops below this many lines (runtime opt-in). */
const BARK_LOW_WATER = 6;

function fmtIssues(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ");
}

/** fetch() with a timeout that also respects an external abort signal. */
async function withTimeout(
  url: string,
  init: RequestInit,
  external?: AbortSignal,
): Promise<Response | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  external?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onAbort);
  }
}

async function apiGet(path: string, signal?: AbortSignal): Promise<unknown> {
  const res = await withTimeout(endpointUrl(path), { method: "GET", headers: { accept: "application/json" } }, signal);
  if (!res || !res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function apiPost(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  const res = await withTimeout(
    endpointUrl(path),
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    },
    signal,
  );
  if (!res || !res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// --- Boot-time reads ---------------------------------------------------------

/** GET /api/ai/status — used to decide whether runtime generation is available. */
export async function fetchStatus(signal?: AbortSignal): Promise<AiStatus | null> {
  const raw = await apiGet(STATUS_PATH, signal);
  if (raw == null) return null;
  const parsed = AiStatusSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}

/** GET /api/ai/content-packs — the server's authored + committed generated packs. */
export async function fetchContentPacks(signal?: AbortSignal): Promise<AuthoredContent | null> {
  const raw = await apiGet(CONTENT_PACKS_PATH, signal);
  if (raw == null) return null;
  const parsed = ContentPacksSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(`[dyn] server /content-packs failed validation — ${fmtIssues(parsed.error)}`);
    return null;
  }
  const d = parsed.data;
  return { barks: d.barks, radioAds: d.radioAds, missions: d.missions, sidequests: d.sidequests };
}

// --- Opt-in runtime generation ----------------------------------------------

export interface GenOpts {
  signal?: AbortSignal;
  /** Skip the client cache lookup (still writes the result). */
  useCache?: boolean;
  seed?: string | null;
}

async function runGenerate<Res>(
  cfg: {
    path: string;
    type: ContentType;
    request: z.ZodTypeAny;
    response: z.ZodType<Res>;
  },
  req: unknown,
  opts: GenOpts,
): Promise<Res | null> {
  const reqParsed = cfg.request.safeParse(req);
  if (!reqParsed.success) {
    console.warn(`[dyn] bad ${cfg.type} request — ${fmtIssues(reqParsed.error)}`);
    return null;
  }
  const key = contentKey({
    type: cfg.type,
    params: reqParsed.data as Record<string, unknown>,
    seed: opts.seed ?? null,
  });
  if (opts.useCache !== false) {
    const cached = readResult<unknown>(key);
    if (cached != null) {
      const c = cfg.response.safeParse(cached);
      if (c.success) return c.data;
    }
  }
  const raw = await apiPost(cfg.path, reqParsed.data, opts.signal);
  if (raw == null) return null;
  const resParsed = cfg.response.safeParse(raw);
  if (!resParsed.success) {
    console.warn(`[dyn] server ${cfg.type} response failed validation — ${fmtIssues(resParsed.error)}`);
    return null;
  }
  writeResult(key, resParsed.data);
  return resParsed.data;
}

export function generateBarks(req: BarkRequest, opts: GenOpts = {}): Promise<BarkPack | null> {
  return runGenerate(
    { path: GENERATE_ENDPOINTS.barks.path, type: "barks", request: BarkRequestSchema, response: BarkPackSchema },
    req,
    opts,
  );
}

export function generateMission(req: MissionRequest, opts: GenOpts = {}): Promise<Mission | null> {
  return runGenerate(
    { path: GENERATE_ENDPOINTS.mission.path, type: "missions", request: MissionRequestSchema, response: MissionSchema },
    req,
    opts,
  );
}

export function generateSideQuest(
  req: SideQuestRequest,
  opts: GenOpts = {},
): Promise<SideQuest | null> {
  return runGenerate(
    {
      path: GENERATE_ENDPOINTS.sidequest.path,
      type: "sidequests",
      request: SideQuestRequestSchema,
      response: SideQuestSchema,
    },
    req,
    opts,
  );
}

export function generateRadioAd(req: RadioAdRequest, opts: GenOpts = {}): Promise<RadioAd | null> {
  return runGenerate(
    { path: GENERATE_ENDPOINTS.radioAd.path, type: "radioAds", request: RadioAdRequestSchema, response: RadioAdSchema },
    req,
    opts,
  );
}

// --- Background refill (never blocks the game) -------------------------------

const refillInFlight = new Set<string>();

/** If runtime is enabled and a bark pool is low, generate + merge more in the
 *  background. Safe to call frequently — it self-debounces per context key and
 *  no-ops entirely when runtime generation is off. */
export async function maybeRefillBarks(ctx: BarkContext): Promise<void> {
  const status = useContentStore.getState().status;
  if (!status?.runtimeEnabled) return;
  const mood = deriveMood(ctx);
  if (barkPoolSize(ctx.district, mood) >= BARK_LOW_WATER) return;
  const key = `${ctx.district}|${mood}`;
  if (refillInFlight.has(key)) return;
  refillInFlight.add(key);
  try {
    const pack = await generateBarks({ district: ctx.district, mood, count: 12 });
    if (pack) useContentStore.getState().mergeContent({ barks: [pack] }, "server");
  } finally {
    refillInFlight.delete(key);
  }
}
