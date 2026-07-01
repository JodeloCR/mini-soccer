// Orchestration: wire transport + sim + view + UI. The host runs the
// authoritative simulation at a fixed tick and broadcasts snapshots; the guest
// streams input and renders interpolated snapshots.

import { Scene3D } from "./game/scene";
import { Controls } from "./game/input";
import { SnapshotBuffer } from "./game/render";
import { createState, step, startCountdown, resetMatch, movePlayer } from "./game/engine";
import { Transport } from "./net/transport";
import { Lobby } from "./ui/lobby";
import { Hud } from "./ui/hud";
import { PHYS, TEAM, teamById } from "./config";
import { DEFAULT_INPUT, type Input, type Player, type Role } from "./net/protocol";

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

// guest-side snapshot interpolation + client-side prediction w/ server reconciliation
const buffer = new SnapshotBuffer();

// host: last guest input seq applied (echoed back in state.ack)
let lastGuestSeq = 0;

// guest: input sequence + un-acked history replayed on top of the authoritative
// state each frame (standard prediction+reconciliation, no rubber-banding)
let inputSeq = 0;
const history: { seq: number; input: Input; dt: number }[] = [];
let authGuest: Player | null = null; // last authoritative guest state
let authAck = 0; // seq the host had applied at that state

// chosen teams (synced; host is authoritative). null = not picked yet.
const teams: { host: string | null; guest: string | null } = { host: null, guest: null };

const transport = new Transport({
  onRole: (r, code) => {
    role = r;
    hud.setRole(r, requestRematch);
    if (r === "host") void lobby.showHostWaiting(code);
    else lobby.showSelect(pickTeam); // guest joined -> choose a team
  },
  onPeerJoined: () => lobby.showSelect(pickTeam), // host: guest arrived -> choose
  onPeerLeft: () => lobby.showError("El otro jugador se desconectó"),
  onError: (msg) => lobby.showError(msg),
  onTransport: (k) => hud.setTransport(k),
  onPeerMsg: (m) => {
    if (m.t === "input" && role === "host") {
      guestInput = m.input;
      if (typeof m.seq === "number") lastGuestSeq = m.seq;
    } else if (m.t === "snapshot" && role === "guest") {
      buffer.push(m.state, performance.now());
      authGuest = m.state.players.guest;
      authAck = m.state.ack;
      // drop inputs the host has already applied
      while (history.length && history[0].seq <= authAck) history.shift();
      startMatch();
    } else if (m.t === "pick" && role === "host") {
      // guest requested a team; accept only if it differs from host's
      if (m.teamId !== teams.host) teams.guest = m.teamId;
      transport.send({ t: "teams", host: teams.host, guest: teams.guest });
      onTeamsChanged();
    } else if (m.t === "teams" && role === "guest") {
      teams.host = m.host;
      teams.guest = m.guest;
      onTeamsChanged();
    } else if (m.t === "rematch" && role === "host") {
      resetMatch(state);
    }
  },
});

function pickTeam(teamId: string) {
  if (role === "host") {
    if (teamId === teams.guest) return; // can't take opponent's team
    teams.host = teamId;
    transport.send({ t: "teams", host: teams.host, guest: teams.guest });
    onTeamsChanged();
  } else {
    if (teamId === teams.host) return; // taken by opponent
    teams.guest = teamId; // optimistic; host echo confirms/corrects
    transport.send({ t: "pick", teamId });
    onTeamsChanged();
  }
}

function onTeamsChanged() {
  const mine = role === "host" ? teams.host : teams.guest;
  const opp = role === "host" ? teams.guest : teams.host;
  if (!started) lobby.renderSelect(mine, opp);

  const h = teamById(teams.host);
  const g = teamById(teams.guest);
  scene.setColors((h ?? TEAM.host).color, (g ?? TEAM.guest).color);
  if (h && g) hud.setTeams(h, g);

  // host starts once both teams are chosen and distinct
  if (role === "host" && teams.host && teams.guest && teams.host !== teams.guest) {
    startMatch();
  }
}

// dev/test hook: current game state (host = authoritative, guest = latest snapshot)
(window as unknown as { __gs?: () => unknown }).__gs = () =>
  role === "host" ? state : buffer.latest();

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
let lastGoals = 0; // total goals seen, to fire the crowd cheer once per goal

function cheerOnGoal(total: number) {
  if (total > lastGoals) scene.cheer();
  lastGoals = total;
}

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
    if (ticks > 0) {
      state.ack = lastGuestSeq; // tell the guest which of its inputs we've applied
      transport.send({ t: "snapshot", state });
    }
    scene.apply(state);
    hud.update(state);
    cheerOnGoal(state.score.host + state.score.guest);
  } else if (started && role === "guest") {
    const inp = controls.getInput();
    inputSeq++;
    history.push({ seq: inputSeq, input: inp, dt: dtReal });
    if (history.length > 240) history.shift();
    transport.send({ t: "input", input: inp, seq: inputSeq });

    const sampled = buffer.sample(now);
    const latest = buffer.latest();
    if (sampled) {
      let guest = sampled.players.guest;
      // predict: replay all un-acked inputs on top of the authoritative state
      if (authGuest && latest?.phase === "playing") {
        const pred: Player = { ...authGuest };
        for (const h of history) if (h.seq > authAck) movePlayer(pred, h.input, h.dt);
        guest = { ...pred, kicking: sampled.players.guest.kicking };
      }
      scene.apply({ ...sampled, players: { host: sampled.players.host, guest } });
    }
    if (latest) {
      hud.update(latest);
      cheerOnGoal(latest.score.host + latest.score.guest);
    }
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
