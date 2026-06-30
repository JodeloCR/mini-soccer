// Orchestration: wire transport + sim + view + UI. The host runs the
// authoritative simulation at a fixed tick and broadcasts snapshots; the guest
// streams input and renders interpolated snapshots.

import { Scene3D } from "./game/scene";
import { Controls } from "./game/input";
import { SnapshotBuffer } from "./game/render";
import { createState, step, startCountdown, resetMatch } from "./game/engine";
import { Transport } from "./net/transport";
import { Lobby } from "./ui/lobby";
import { Hud } from "./ui/hud";
import { PHYS } from "./config";
import { DEFAULT_INPUT, type Input, type Role } from "./net/protocol";

const app = document.getElementById("app")!;

let scene: Scene3D;
try {
  scene = new Scene3D(app);
} catch {
  app.innerHTML = `<div class="overlay"><div class="card">
    <div class="subtitle">WebGL no disponible</div>
    <p class="hint">Tu navegador no soporta los gráficos del juego. Probá con Chrome o Safari actualizado.</p>
  </div></div>`;
  throw new Error("WebGL unavailable");
}

const controls = new Controls(app);
const lobby = new Lobby(app);
const hud = new Hud(app);

const roomParam = new URLSearchParams(location.search).get("room");

let role: Role = "host";
let started = false;

// host-authoritative state
const state = createState();
let guestInput: Input = { ...DEFAULT_INPUT };

// guest-side snapshot interpolation
const buffer = new SnapshotBuffer();
let lastInputSent = 0;

const transport = new Transport({
  onRole: (r, code) => {
    role = r;
    hud.setRole(r, requestRematch);
    if (r === "host") void lobby.showHostWaiting(code);
  },
  onPeerJoined: () => startMatch(), // host learns the guest arrived
  onPeerLeft: () => lobby.showError("El otro jugador se desconectó"),
  onError: (msg) => lobby.showError(msg),
  onTransport: (k) => hud.setTransport(k),
  onPeerMsg: (m) => {
    if (m.t === "input" && role === "host") {
      guestInput = m.input;
    } else if (m.t === "snapshot" && role === "guest") {
      buffer.push(m.state, performance.now());
      startMatch();
    } else if (m.t === "rematch" && role === "host") {
      resetMatch(state);
    }
  },
});

function startMatch() {
  if (started) return;
  started = true;
  lobby.hide();
  if (role === "host") startCountdown(state);
}

function requestRematch() {
  if (role === "host") resetMatch(state);
  else transport.send({ t: "rematch" });
}

// ---- render / sim loop ----
let acc = 0;
let prev = performance.now();

function frame(now: number) {
  const dtReal = Math.min(0.1, (now - prev) / 1000);
  prev = now;

  if (started && role === "host") {
    acc += dtReal;
    let ticks = 0;
    while (acc >= PHYS.dt && ticks < 5) {
      step(state, controls.getInput(), guestInput, PHYS.dt);
      acc -= PHYS.dt;
      ticks++;
    }
    if (ticks > 0) transport.send({ t: "snapshot", state });
    scene.apply(state);
    hud.update(state);
  } else if (started && role === "guest") {
    if (now - lastInputSent > 1000 / PHYS.tickHz) {
      transport.send({ t: "input", input: controls.getInput() });
      lastInputSent = now;
    }
    const sampled = buffer.sample(now);
    const latest = buffer.latest();
    if (sampled) scene.apply(sampled);
    if (latest) hud.update(latest);
  }

  scene.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- boot ----
(async () => {
  try {
    await transport.connect();
  } catch {
    lobby.showError("No se pudo conectar al servidor");
    return;
  }
  if (roomParam) {
    lobby.showJoining(roomParam);
    transport.joinRoom(roomParam);
  } else {
    lobby.showStart(() => transport.createRoom());
  }
})();
