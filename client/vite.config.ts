import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// NOTE: These MUST mirror shared/src/constants/net.ts. We can't import @sunbreak/shared here
// because Vite loads this config through Node's native ESM, which doesn't resolve the shared
// package's extensionless directory re-exports (the app bundle resolves them fine).
const CLIENT_PORT = 5173;
const SERVER_PORT = 8787;
const API_BASE = "/api";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  assetsInclude: ["**/*.glb", "**/*.gltf", "**/*.hdr", "**/*.exr", "**/*.ktx2"],
  server: {
    port: CLIENT_PORT,
    proxy: {
      // one origin in the browser: /api -> Express server
      [API_BASE]: { target: `http://localhost:${SERVER_PORT}`, changeOrigin: true },
      // reserved for v4 Colyseus:
      "/matchmake": { target: `http://localhost:${SERVER_PORT}`, changeOrigin: true },
      "/colyseus": { target: `ws://localhost:${SERVER_PORT}`, ws: true },
    },
  },
  optimizeDeps: {
    // R3F reconciler shouldn't be pre-bundled; rapier ships inlined base64 WASM (compat build)
    exclude: ["@react-three/fiber", "@react-three/rapier"],
  },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          r3f: ["@react-three/fiber", "@react-three/drei", "@react-three/postprocessing"],
          physics: ["@react-three/rapier"],
          ecs: ["miniplex", "miniplex-react", "zustand"],
        },
      },
    },
  },
});
