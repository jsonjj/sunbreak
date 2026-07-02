// Cost + abuse guardrails, in-memory (no DB dependency, nothing to break at boot).
//   • per-session USD/day cap   • global USD/day cap   • per-session requests/minute (RPM)
// Caps reset at the UTC day boundary. `check()` gates BEFORE a call using already-accrued spend
// (so a cap can be exceeded by at most one small request — acceptable given tiny token caps),
// and `record()` debits actual spend after each live call.

import { config } from "./config";
import type { AiUsage } from "./types";

const MAX_SESSIONS = 5000; // bound memory; evict least-recently-seen beyond this

interface SessionLedger {
  day: string;
  usd: number;
  requests: number;
  windowStart: number;
  windowCount: number;
  lastSeen: number;
}

const sessions = new Map<string, SessionLedger>();
const global = { day: dayKey(), usd: 0, requests: 0 };

function dayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function rollGlobal(day: string): void {
  if (global.day !== day) {
    global.day = day;
    global.usd = 0;
    global.requests = 0;
  }
}

function getSession(sessionId: string, now: number): SessionLedger {
  const day = dayKey(now);
  let s = sessions.get(sessionId);
  if (!s) {
    s = { day, usd: 0, requests: 0, windowStart: now, windowCount: 0, lastSeen: now };
    sessions.set(sessionId, s);
    evictIfNeeded();
  } else if (s.day !== day) {
    s.day = day;
    s.usd = 0;
    s.requests = 0;
    s.windowStart = now;
    s.windowCount = 0;
  }
  s.lastSeen = now;
  return s;
}

function evictIfNeeded(): void {
  if (sessions.size <= MAX_SESSIONS) return;
  let oldestKey: string | undefined;
  let oldest = Infinity;
  for (const [k, v] of sessions) {
    if (v.lastSeen < oldest) {
      oldest = v.lastSeen;
      oldestKey = k;
    }
  }
  if (oldestKey) sessions.delete(oldestKey);
}

export type BudgetReason = "rate" | "session_budget" | "global_budget";
export interface BudgetDecision {
  ok: boolean;
  reason?: BudgetReason;
}

/**
 * Gate a would-be live call. On success, reserves one RPM slot. Cache hits / offline replays
 * should NOT call this (they cost nothing) — only gate real OpenAI calls.
 */
export function check(sessionId: string): BudgetDecision {
  const now = Date.now();
  const day = dayKey(now);
  rollGlobal(day);
  const s = getSession(sessionId, now);

  if (now - s.windowStart >= 60_000) {
    s.windowStart = now;
    s.windowCount = 0;
  }
  if (s.windowCount >= config.sessionRpm) return { ok: false, reason: "rate" };
  if (s.usd >= config.sessionDailyUsd) return { ok: false, reason: "session_budget" };
  if (global.usd >= config.globalDailyUsd) return { ok: false, reason: "global_budget" };

  s.windowCount += 1;
  return { ok: true };
}

/** Debit actual spend after a live call completes. */
export function record(sessionId: string, usage: AiUsage): void {
  const now = Date.now();
  rollGlobal(dayKey(now));
  const s = getSession(sessionId, now);
  s.usd += usage.costUsd;
  s.requests += 1;
  global.usd += usage.costUsd;
  global.requests += 1;
}

export function budgetSnapshot(): {
  day: string;
  globalUsd: number;
  globalCapUsd: number;
  sessionCapUsd: number;
  sessionRpm: number;
  activeSessions: number;
} {
  return {
    day: global.day,
    globalUsd: Number(global.usd.toFixed(6)),
    globalCapUsd: config.globalDailyUsd,
    sessionCapUsd: config.sessionDailyUsd,
    sessionRpm: config.sessionRpm,
    activeSessions: sessions.size,
  };
}
