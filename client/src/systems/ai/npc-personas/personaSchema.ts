// Runtime validation for persona cards. The authored cards are already TS-typed as
// `PersonaCard`; this schema is the fail-fast guard at boot (catches empty required
// arrays / missing greetings / typos) and the gate for any future JSON-loaded cards.
import { z } from "zod";

const fewShotSchema = z.object({
  user: z.string().min(1),
  npc: z.string().min(1),
});

export const personaCardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  district: z.string().optional(),
  region: z.string().optional(),
  faction: z.string().optional(),
  archetype: z
    .enum(["bartender", "cabbie", "beat-cop", "shopkeeper", "corner-kid", "local"])
    .optional(),
  personality: z.array(z.string().min(1)).min(1),
  speechStyle: z.string().min(1),
  knowledge: z.array(z.string()),
  secrets: z.array(z.string()).optional(),
  relationships: z.record(z.string(), z.string()).optional(),
  guardrails: z.array(z.string()),
  wantedReactions: z.record(z.string(), z.string()).optional(),
  greeting: z.string().min(1),
  fallbackLines: z.array(z.string().min(1)).min(1),
  fewShot: z.array(fewShotSchema).optional(),
  maxTokens: z.number().int().positive().optional(),
  color: z.string().optional(),
  portrait: z.string().optional(),
  voice: z.string().optional(),
});

/** Validate one card; returns the (structurally-checked) card or throws a ZodError. */
export function validatePersonaCard(card: unknown): void {
  personaCardSchema.parse(card);
}
