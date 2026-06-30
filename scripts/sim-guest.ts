// Dev-only: headless guest. Joins a room, chases the ball and pushes toward the
// -x goal, asserts snapshots flow + phases advance. Run:
//   npx tsx scripts/sim-guest.ts CODE
import WebSocket from "ws";
import type { GameState } from "../src/net/protocol";

const code = process.argv[2];
if (!code) {
  console.error("usage: tsx scripts/sim-guest.ts CODE");
  process.exit(1);
}

const ws = new WebSocket("ws://localhost:8080/ws");
let snaps = 0;
let lastPhase = "";
let firstGuestX: number | null = null;
let movedGuest = false;
let sawCountdown = false;
let sawPlaying = false;
let sawGoalOrWon = false;
let maxScore = 0;

ws.on("open", () => ws.send(JSON.stringify({ t: "join", code })));
ws.on("message", (buf) => {
  const m = JSON.parse(buf.toString());
  if (m.t === "joined") console.log("JOINED", code);
  else if (m.t === "error") {
    console.log("ERROR:", m.msg);
    process.exit(2);
  } else if (m.t === "peer-msg" && m.payload.t === "snapshot") {
    const s: GameState = m.payload.state;
    snaps++;
    if (firstGuestX === null) firstGuestX = s.players.guest.x;
    if (Math.abs(s.players.guest.x - firstGuestX) > 0.3) movedGuest = true;
    maxScore = Math.max(maxScore, s.score.host + s.score.guest);
    if (s.phase !== lastPhase) {
      console.log(`phase -> ${s.phase}  score ${s.score.host}-${s.score.guest}`);
      lastPhase = s.phase;
      if (s.phase === "countdown") sawCountdown = true;
      if (s.phase === "playing") sawPlaying = true;
      if (s.phase === "goal" || s.phase === "won") sawGoalOrWon = true;
    }
    const dx = s.ball.x - s.players.guest.x;
    const dy = s.ball.y - s.players.guest.y;
    const d = Math.hypot(dx, dy) || 1;
    ws.send(
      JSON.stringify({
        t: "msg",
        payload: { t: "input", input: { move: { x: dx / d, y: dy / d }, kick: d < 1.4 } },
      }),
    );
  }
});

setTimeout(() => {
  const ok = snaps > 60 && movedGuest && sawCountdown && sawPlaying;
  console.log(
    `\nRESULT snaps=${snaps} guestMoved=${movedGuest} countdown=${sawCountdown} playing=${sawPlaying} goalOrWon=${sawGoalOrWon} totalGoals=${maxScore}`,
  );
  console.log(ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
}, 18000);
