import { defineConfig } from "vite";

// Dev: Vite serves the client on :5173 and proxies the WebSocket to the
// game server on :8080. In production the server itself serves /dist + /ws.
export default defineConfig({
  server: {
    port: 5173,
    host: true, // expose on LAN for phone testing
    proxy: {
      "/ws": { target: "ws://localhost:8080", ws: true },
    },
  },
  build: {
    outDir: "dist",
    target: "es2020",
  },
});
