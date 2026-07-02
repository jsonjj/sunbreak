// Minimal runnable Express skeleton. Boots with NO OpenAI key required (v0). Wave-2 server
// subsystems (OpenAI proxy, Colyseus rooms, SQLite persistence, accounts, anti-cheat) live
// under src/<domain>/<subsystem> and are auto-loaded + wired in by the kernel below — this
// entry file is central wiring and is NOT edited by subsystem agents.

import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { API_BASE, PROTOCOL_VERSION } from "@sunbreak/shared";
import { env, hasOpenAIKey } from "./env";
import { applyBoot } from "./kernel/registry";
import { loadServerSubsystems } from "./kernel/systems-loader";

const app = express();
app.use(cors({ origin: env.CLIENT_ORIGIN }));
app.use(express.json());

app.get(`${API_BASE}/health`, (_req, res) => {
  res.json({ ok: true, protocol: PROTOCOL_VERSION, aiEnabled: hasOpenAIKey });
});

// Explicit HTTP server so subsystems can attach transports (e.g. Colyseus/WebSocket, v4).
const httpServer = createServer(app);

// Auto-load every server subsystem (each self-registers routes/modules on import), then
// hand each its boot context so it can mount routes / attach to the HTTP server.
await loadServerSubsystems();
applyBoot({ app, httpServer, env });

httpServer.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[sunbreak] server listening on http://localhost:${env.PORT}  (OpenAI key: ${
      hasOpenAIKey ? "set" : "not set — AI features disabled"
    })`,
  );
});
