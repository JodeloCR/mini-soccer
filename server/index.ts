// Express serves the built client; WebSocketServer handles room signaling +
// game-state relay. Two players per room: host (created it) and guest (joined).

import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "url";
import path from "path";
import type { ClientMsg, Role, ServerMsg } from "../src/net/protocol";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const distDir = path.resolve(__dirname, "../dist");

const app = express();
app.get("/healthz", (_req, res) => res.send("ok"));

// WebRTC ICE config. STUN is always included (enables direct P2P). A TURN relay
// is added only if configured via env (TURN_URL/TURN_USER/TURN_PASS) — needed for
// connectivity on strict NAT, not for speed. iceTransportPolicy stays "all" so
// direct P2P is always preferred and TURN is a last-resort fallback.
app.get("/ice", (_req, res) => {
  // Several STUN servers → more candidate paths → direct P2P succeeds on more
  // networks (not just same-WiFi) without ever needing a relay.
  const iceServers: RTCIceServer[] = [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun.cloudflare.com:3478",
      ],
    },
  ];
  const { TURN_URL, TURN_USER, TURN_PASS } = process.env;
  if (TURN_URL && TURN_USER && TURN_PASS) {
    iceServers.push({ urls: TURN_URL.split(","), username: TURN_USER, credential: TURN_PASS });
  }
  res.json({ iceServers });
});
app.use(express.static(distDir));
// SPA fallback so /?room=ABCD loads index.html
app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

interface Peer {
  ws: WebSocket;
  role: Role;
  room: string;
}
interface Room {
  host?: Peer;
  guest?: Peer;
}
const rooms = new Map<string, Room>();

function newCode(): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no easily-confused chars
  let c = "";
  for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)];
  return rooms.has(c) ? newCode() : c;
}

function send(ws: WebSocket, m: ServerMsg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
}

wss.on("connection", (ws) => {
  let me: Peer | null = null;

  ws.on("message", (buf) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }

    if (msg.t === "create") {
      if (me) return; // already in a room
      const code = newCode();
      me = { ws, role: "host", room: code };
      rooms.set(code, { host: me });
      send(ws, { t: "created", code });
      return;
    }

    if (msg.t === "join") {
      if (me) return;
      const room = rooms.get(msg.code.toUpperCase());
      if (!room || !room.host) return send(ws, { t: "error", msg: "Sala no existe" });
      if (room.guest) return send(ws, { t: "error", msg: "Sala llena" });
      me = { ws, role: "guest", room: msg.code.toUpperCase() };
      room.guest = me;
      send(ws, { t: "joined" });
      send(room.host.ws, { t: "peer-joined" });
      return;
    }

    if (msg.t === "msg") {
      if (!me) return;
      const room = rooms.get(me.room);
      if (!room) return;
      const other = me.role === "host" ? room.guest : room.host;
      if (other) send(other.ws, { t: "peer-msg", payload: msg.payload });
      return;
    }
  });

  ws.on("close", () => {
    if (!me) return;
    const room = rooms.get(me.room);
    if (!room) return;
    const other = me.role === "host" ? room.guest : room.host;
    if (other) send(other.ws, { t: "peer-left" });
    rooms.delete(me.room); // tear down the whole room on any disconnect
  });
});

server.listen(PORT, () => console.log(`mini-soccer listening on :${PORT}`));
