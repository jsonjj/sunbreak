// Minimal runnable Express skeleton. Boots with NO OpenAI key required (v0). Placeholders for
// the OpenAI proxy (v3), Colyseus rooms + SQLite persistence (v4) live under src/ai and
// src/online and are wired in by their owning subsystems.

import express from "express";
import cors from "cors";
import { API_BASE, PROTOCOL_VERSION } from "@sunbreak/shared";
import { env, hasOpenAIKey } from "./env";

const app = express();
app.use(cors({ origin: env.CLIENT_ORIGIN }));
app.use(express.json());

app.get(`${API_BASE}/health`, (_req, res) => {
  res.json({ ok: true, protocol: PROTOCOL_VERSION, aiEnabled: hasOpenAIKey });
});

// --- Placeholders (implemented by their subsystems; inert in v0) -------------------------
// AI proxy:      ${API_BASE}/ai/*      -> src/ai/openai-service           (v3)
// Colyseus:      /matchmake, /colyseus -> src/online/server-sim           (v4)
// Persistence:   SQLite (better-sqlite3) -> src/online/persistence        (v4)
// Accounts:      ${API_BASE}/auth/*    -> src/online/accounts             (v4)

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[sunbreak] server listening on http://localhost:${env.PORT}  (OpenAI key: ${
      hasOpenAIKey ? "set" : "not set — AI features disabled"
    })`,
  );
});
