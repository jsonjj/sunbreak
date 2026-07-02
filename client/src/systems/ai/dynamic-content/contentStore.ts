// ─────────────────────────────────────────────────────────────────────────────
// contentStore — the in-memory home for loaded content + fast pool selection
// ─────────────────────────────────────────────────────────────────────────────
// Reactive fields (arrays, counts, status) drive the debug panel and hooks. The
// hot selection path (getBark/getRadioAd/getMission) reads from precomputed,
// NON-reactive index maps and does round-robin + recent-dedupe with zero renders
// and zero allocations per call — safe to call from the ECS update loop.

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  District,
  Mood,
  Speaker,
  Station,
  TimeOfDay,
  Weather,
  MissionType,
} from "./canon";
import type { Bark, BarkPack, ContentType, Mission, RadioAd, SideQuest } from "./contract/schemas";
import type { AiStatus } from "./contract/endpoints";
import type { AuthoredContent } from "./packs";

export type LoadSource = "none" | "bundled" | "cache" | "server" | "mixed";

/** The world context the bark director samples each tick (fed by other subsystems). */
export interface BarkContext {
  district: District;
  weather: Weather;
  timeOfDay: TimeOfDay;
  wanted: number;
  speaker?: Speaker;
}

export const DEFAULT_BARK_CONTEXT: BarkContext = {
  district: "downtown",
  weather: "clear",
  timeOfDay: "day",
  wanted: 0,
};

/** Coarse mood used to key bark pools — derived from the fine-grained context. */
export function deriveMood(ctx: BarkContext): Mood {
  if (ctx.weather === "storm") return "storm";
  if (ctx.wanted >= 2) return "tense";
  const nightlife = ctx.district === "the_keys" || ctx.district === "little_ayiti";
  if (nightlife && (ctx.timeOfDay === "dusk" || ctx.timeOfDay === "night")) return "festive";
  return "calm";
}

// --- Non-reactive indexes + round-robin state --------------------------------
interface BarkIndex {
  byKey: Map<string, Bark[]>; // `${district}|${mood}`
  byMood: Map<Mood, Bark[]>;
  all: Bark[];
}
const barkIndex: BarkIndex = { byKey: new Map(), byMood: new Map(), all: [] };
const adsByStation = new Map<Station, RadioAd[]>();
const allAds: RadioAd[] = [];
const missionsByDistrict = new Map<District, Mission[]>();
const allMissions: Mission[] = [];
const sidequestsByDistrict = new Map<District, SideQuest[]>();
const allSidequests: SideQuest[] = [];

const cursors = new Map<string, number>();
const recent = new Map<string, string[]>();

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

function rebuildIndexes(content: AuthoredContent): void {
  barkIndex.byKey.clear();
  barkIndex.byMood.clear();
  barkIndex.all.length = 0;
  adsByStation.clear();
  allAds.length = 0;
  missionsByDistrict.clear();
  allMissions.length = 0;
  sidequestsByDistrict.clear();
  allSidequests.length = 0;
  cursors.clear();
  recent.clear();

  for (const pack of content.barks) {
    const key = `${pack.context.district}|${pack.context.mood}`;
    for (const bark of pack.barks) {
      push(barkIndex.byKey, key, bark);
      push(barkIndex.byMood, pack.context.mood, bark);
      barkIndex.all.push(bark);
    }
  }
  for (const ad of content.radioAds) {
    push(adsByStation, ad.station, ad);
    allAds.push(ad);
  }
  for (const m of content.missions) {
    push(missionsByDistrict, m.district, m);
    allMissions.push(m);
  }
  for (const sq of content.sidequests) {
    push(sidequestsByDistrict, sq.district, sq);
    allSidequests.push(sq);
  }
}

/** Round-robin pick that avoids the last few returned ids for the same pool. */
function pick<T>(poolKey: string, items: T[], idOf: (t: T) => string): T | null {
  const n = items.length;
  if (n === 0) return null;
  const start = cursors.get(poolKey) ?? Math.floor(Math.random() * n);
  const seen = recent.get(poolKey) ?? [];
  let chosen: T | undefined;
  let chosenIdx = start % n;
  for (let i = 0; i < n; i++) {
    const idx = (start + i) % n;
    const cand = items[idx];
    if (!cand) continue;
    if (!seen.includes(idOf(cand))) {
      chosen = cand;
      chosenIdx = idx;
      break;
    }
  }
  if (!chosen) {
    chosen = items[start % n];
    chosenIdx = start % n;
  }
  if (!chosen) return null;
  cursors.set(poolKey, (chosenIdx + 1) % n);
  seen.push(idOf(chosen));
  const cap = Math.min(5, Math.max(0, n - 1));
  while (seen.length > cap) seen.shift();
  recent.set(poolKey, seen);
  return chosen;
}

function countBarkLines(packs: BarkPack[]): number {
  let total = 0;
  for (const p of packs) total += p.barks.length;
  return total;
}

/** Non-reactive: how many bark lines are currently pooled for a district+mood.
 *  Used by the runtime refill low-water-mark check (see content-client). */
export function barkPoolSize(district: District, mood: Mood): number {
  return (barkIndex.byKey.get(`${district}|${mood}`) ?? []).length;
}

// --- Merge helpers (dedupe by identity so server refills never duplicate) -----
function mergeBarks(current: BarkPack[], incoming: BarkPack[]): BarkPack[] {
  const byKey = new Map<string, BarkPack>();
  for (const p of current) byKey.set(`${p.context.district}|${p.context.mood}`, p);
  for (const p of incoming) {
    const key = `${p.context.district}|${p.context.mood}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, p);
    } else {
      const seen = new Set(existing.barks.map((b) => b.text));
      const merged = [...existing.barks];
      for (const b of p.barks) if (!seen.has(b.text)) merged.push(b);
      byKey.set(key, { context: p.context, barks: merged });
    }
  }
  return [...byKey.values()];
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of current) byId.set(item.id, item);
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}

interface ContentState {
  ready: boolean;
  source: LoadSource;
  status: AiStatus | null;
  counts: Record<ContentType, number>;
  barks: BarkPack[];
  radioAds: RadioAd[];
  missions: Mission[];
  sidequests: SideQuest[];
  barkContext: BarkContext;
  activeBarks: number;

  /** Replace all content and rebuild pools. */
  setContent: (content: AuthoredContent, source: LoadSource) => void;
  /** Merge additional content (e.g. a server refresh or runtime refill). */
  mergeContent: (partial: Partial<AuthoredContent>, source: LoadSource) => void;
  setStatus: (status: AiStatus | null) => void;
  setBarkContext: (ctx: Partial<BarkContext>) => void;
  setActiveBarks: (n: number) => void;

  getBark: (ctx?: Partial<BarkContext>) => Bark | null;
  getRadioAd: (station: Station) => RadioAd | null;
  getMission: (params?: { district?: District; type?: MissionType }) => Mission | null;
  getSideQuest: (params?: { district?: District }) => SideQuest | null;
}

function applyContent(
  set: (partial: Partial<ContentState>) => void,
  content: AuthoredContent,
  source: LoadSource,
): void {
  rebuildIndexes(content);
  set({
    ready: true,
    source,
    barks: content.barks,
    radioAds: content.radioAds,
    missions: content.missions,
    sidequests: content.sidequests,
    counts: {
      barks: countBarkLines(content.barks),
      radioAds: content.radioAds.length,
      missions: content.missions.length,
      sidequests: content.sidequests.length,
    },
  });
}

export const useContentStore = create<ContentState>()(
  subscribeWithSelector((set, get) => ({
    ready: false,
    source: "none",
    status: null,
    counts: { barks: 0, radioAds: 0, missions: 0, sidequests: 0 },
    barks: [],
    radioAds: [],
    missions: [],
    sidequests: [],
    barkContext: DEFAULT_BARK_CONTEXT,
    activeBarks: 0,

    setContent: (content, source) => applyContent(set, content, source),

    mergeContent: (partial, source) => {
      const cur = get();
      const merged: AuthoredContent = {
        barks: partial.barks ? mergeBarks(cur.barks, partial.barks) : cur.barks,
        radioAds: partial.radioAds ? mergeById(cur.radioAds, partial.radioAds) : cur.radioAds,
        missions: partial.missions ? mergeById(cur.missions, partial.missions) : cur.missions,
        sidequests: partial.sidequests
          ? mergeById(cur.sidequests, partial.sidequests)
          : cur.sidequests,
      };
      const nextSource: LoadSource =
        cur.source === "none" || cur.source === source ? source : "mixed";
      applyContent(set, merged, nextSource);
    },

    setStatus: (status) => set({ status }),
    setBarkContext: (ctx) => set({ barkContext: { ...get().barkContext, ...ctx } }),
    setActiveBarks: (n) => set({ activeBarks: n }),

    getBark: (partial) => {
      const ctx: BarkContext = { ...get().barkContext, ...partial };
      const mood = deriveMood(ctx);
      const key = `${ctx.district}|${mood}`;
      let pool = barkIndex.byKey.get(key);
      if (!pool || pool.length === 0) pool = barkIndex.byMood.get(mood);
      if (!pool || pool.length === 0) pool = barkIndex.all;
      if (!pool || pool.length === 0) return null;
      let poolKey = key;
      if (ctx.speaker) {
        const filtered = pool.filter((b) => b.speaker === ctx.speaker);
        if (filtered.length > 0) {
          pool = filtered;
          poolKey = `${key}|${ctx.speaker}`;
        }
      }
      return pick(poolKey, pool, (b) => b.text);
    },

    getRadioAd: (station) => {
      const pool = adsByStation.get(station) ?? allAds;
      return pick(`ad|${station}`, pool, (a) => a.id);
    },

    getMission: (params) => {
      const district = params?.district;
      let pool = district ? missionsByDistrict.get(district) ?? allMissions : allMissions;
      let poolKey = `mission|${district ?? "*"}`;
      if (params?.type) {
        const filtered = pool.filter((m) => m.type === params.type);
        if (filtered.length > 0) {
          pool = filtered;
          poolKey = `${poolKey}|${params.type}`;
        }
      }
      return pick(poolKey, pool, (m) => m.id);
    },

    getSideQuest: (params) => {
      const district = params?.district;
      const pool = district
        ? sidequestsByDistrict.get(district) ?? allSidequests
        : allSidequests;
      return pick(`sq|${district ?? "*"}`, pool, (sq) => sq.id);
    },
  })),
);
