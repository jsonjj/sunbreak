// Network + dev-topology constants used by BOTH client and server.

export const PROTOCOL_VERSION = 1;

/** Dev ports. The client's Vite `/api` proxy forwards to the server so the browser
 *  only ever talks to one origin. */
export const SERVER_PORT = 8787;
export const CLIENT_PORT = 5173;
export const API_BASE = "/api";

/** Authoritative sim + patch rates (live in v4). */
export const SERVER_TICK_HZ = 30;
export const PATCH_RATE_HZ = 20;
export const INPUT_SEND_HZ = 30;
export const INTERP_DELAY_MS = 100;
export const AOI_RADIUS = 120;
export const MAX_MSG_PER_SEC = 60;
