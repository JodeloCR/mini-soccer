// Dev-only: headless host. Mirrors main.ts host logic (real engine + fixed
// tick + snapshot broadcast) without three.js, to integration-test the
// networked game loop. Run: npx tsx scripts/sim-host.ts
import WebSocket from "ws";
import { createState, step, startCountdown } from "../src/game/engine";
import { PHYS } from "../src/config";
import type { Input } from "../src/net/protocol";

const ws = new WebSocket("ws://localhost:8080/ws");
const state = createState();
let guestInput: Input = { move: { x: 0, y: 0 }, kick: false };
let timer: NodeJS.Timeout | null = null;

ws.on("open", () => ws.send(JSON.stringify({ t: "create" })));
ws.on("message", (buf) => {
  const m = JSON.parse(buf.toString());
  if (m.t === "created") console.log("CODE=" + m.code);
  else if (m.t === "peer-joined") startLoop();
  else if (m.t === "peer-msg" && m.payload.t === "input") guestInput = m.payload.input;
});

function hostAI(): Input {
  const b = state.ball;
  const p = state.players.host;
  // get behind the ball (on the -x side) and push it toward the +x goal
  const tx = b.x - 0.55;
  const ty = b.y;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const near = Math.hypot(b.x - p.x, b.y - p.y) < 1.35;
  return { move: { x: dx / d, y: dy / d }, kick: near };
}

function startLoop() {
  if (timer) return;
  startCountdown(state);
  // real-time accumulator (mirrors main.ts rAF loop) so fixed-step sim time
  // tracks wall clock regardless of timer granularity
  let acc = 0;
  let prev = Date.now();
  timer = setInterval(() => {
    const now = Date.now();
    acc += (now - prev) / 1000;
    prev = now;
    let ticks = 0;
    while (acc >= PHYS.dt && ticks < 10) {
      step(state, hostAI(), guestInput, PHYS.dt);
      acc -= PHYS.dt;
      ticks++;
    }
    if (ticks > 0) ws.send(JSON.stringify({ t: "msg", payload: { t: "snapshot", state } }));
  }, 8);
}

setTimeout(() => {
  console.log("HOST_DONE", JSON.stringify(state.score), "phase", state.phase, "winner", state.winner);
  process.exit(0);
}, 22000);
