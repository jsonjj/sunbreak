// Offline / degraded path. Used whenever we must NOT (or cannot) call OpenAI: no key, operator
// AI_OFFLINE, over budget, moderated input, or any API error/timeout. Everything here is
// authored in-repo (original, CC0-spirit) and picked DETERMINISTICALLY so the same context
// yields a stable line (no flicker, cache-friendly). The game is always fully playable.

import { getPersona } from "./personas";
import type { AiContentKind, AiContentRequest, AiDialogueRequest } from "./types";

/** Stable 32-bit FNV-1a hash → non-negative int, for deterministic picks. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(arr: readonly T[], seed: number, fallback: T): T {
  if (arr.length === 0) return fallback;
  return arr[seed % arr.length] as T;
}

/** Deterministic offline dialogue line for a request. */
export function dialogueFallback(req: AiDialogueRequest): string {
  const persona = getPersona(req.personaId ?? req.npcId);
  const category = req.category ?? "npc_dialogue";
  const player = (req.playerText ?? "").trim();

  // A cold open with no player text → greeting (free, on-brand).
  if (!player && (category === "npc_dialogue" || category === "ambient_bark")) {
    if (category === "ambient_bark") {
      const seed = hashString(`${persona.id}|${JSON.stringify(req.context ?? {})}`);
      return pick(persona.fallbackLines, seed, persona.greeting);
    }
    return persona.greeting;
  }

  const seed = hashString(
    `${persona.id}|${category}|${req.conversationId ?? ""}|${player}|${JSON.stringify(req.context ?? {})}`,
  );
  return pick(persona.fallbackLines, seed, persona.greeting);
}

// ── Authored content packs (zero-key fallback for the content routes) ──────────────────

const MISSIONS = [
  {
    title: "Short-Notice Repossession",
    giver: "Sparks",
    district: "The Keys",
    summary: "A client skipped three payments on a very fast boat. Sparks wants it back before sunrise.",
    objectives: ["Locate the marked cigarette boat", "Hotwire it quietly", "Outrun the harbor patrol", "Deliver it to the marina"],
    reward: 4500,
    failConditions: ["Boat destroyed", "Spotted by SVPD marine unit"],
  },
  {
    title: "Debt With Interest",
    giver: "Cami",
    district: "El Recodo",
    summary: "A pharmacy owner owes the wrong people. Cami wants it handled without touching a single customer.",
    objectives: ["Meet the contact behind the bodega", "Recover the ledger", "Leave before the shift change"],
    reward: 3200,
    failConditions: ["A civilian gets hurt", "Ledger left behind"],
  },
];

const SIDEQUESTS = [
  {
    title: "The Airboat Philosopher",
    character: "A Glades tour guide",
    district: "The Glades",
    hook: "He swears the wildlife is unionizing and needs a witness for the meeting.",
    steps: ["Take the sunset airboat ride", "Photograph the 'delegates'", "Return before the mosquitoes vote"],
    payoff: "A hand-carved lucky charm and a suspiciously good fishing spot.",
  },
];

const RADIO_ADS = [
  {
    brand: "SunVault",
    product: "VeraCoin savings vault",
    script: "Tired of your money just sitting there being real? SunVault turns it into VeraCoin — the coin that's up, down, and legally distinct from a promise! Terms are vibes.",
    tagline: "SunVault: your future is definitely somewhere.",
  },
  {
    brand: "Shutter Bros",
    product: "storm shutters",
    script: "Hurricane season's coming, and so are the Shutter Bros! Same-day install, cash only, warranty valid until we drive away. If the shutter flies off, congratulations — it's now a kite!",
    tagline: "Shutter Bros: we bolt first, ask never.",
  },
];

const BARKS: Record<string, string[]> = {
  civilian: [
    "Move it, I'm late for something that pays!",
    "You seein' these prices? Highway robbery.",
    "Not my block, not my problem.",
  ],
  vendor: ["Fresh stone crab, cash only!", "Two for one, today only, maybe tomorrow!"],
  tourist: ["Is this the beach? The app said this was the beach.", "Honey, take my picture with the weird bird!"],
  gangster: ["You're on the wrong corner, friend.", "Keep walkin'. Nothin' here for you."],
  cop: ["Keep it moving.", "I've got my eye on you."],
};

/** Deterministic authored content for a kind (used when OpenAI is unavailable). */
export function contentFallback(kind: AiContentKind, req: AiContentRequest): unknown {
  const seed = hashString(`${kind}|${JSON.stringify(req.context ?? {})}`);
  switch (kind) {
    case "mission":
      return pick(MISSIONS, seed, MISSIONS[0] as (typeof MISSIONS)[number]);
    case "sidequest":
      return pick(SIDEQUESTS, seed, SIDEQUESTS[0] as (typeof SIDEQUESTS)[number]);
    case "radio_ad":
      return pick(RADIO_ADS, seed, RADIO_ADS[0] as (typeof RADIO_ADS)[number]);
    case "bark": {
      const n = Math.max(1, Math.min(10, req.count ?? 6));
      const speakers = Object.keys(BARKS);
      const barks: Array<{ text: string; speaker: string }> = [];
      for (let i = 0; i < n; i++) {
        const speaker = speakers[(seed + i) % speakers.length] as string;
        const lines = BARKS[speaker] ?? [];
        const text = lines[(seed + i) % Math.max(1, lines.length)] ?? "…";
        barks.push({ text, speaker });
      }
      return { barks };
    }
    default:
      return {};
  }
}
