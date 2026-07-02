// Fail-fast env loading + validation. NOTE (v0): OPENAI_API_KEY is OPTIONAL so the server
// boots with no key — the game is fully playable offline. The AI proxy subsystem (v3) will
// require the key only for the /api/ai/* routes.

import "dotenv/config";
import { z } from "zod";
import { SERVER_PORT } from "@sunbreak/shared";

const Env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(SERVER_PORT),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  AI_RATE_LIMIT_PER_MIN: z.coerce.number().default(20),
  DATABASE_PATH: z.string().default("./data/sunbreak.db"),
});

export const env = Env.parse(process.env);

/** Whether the OpenAI proxy can be enabled (a key is present). */
export const hasOpenAIKey = env.OPENAI_API_KEY.length > 0;
