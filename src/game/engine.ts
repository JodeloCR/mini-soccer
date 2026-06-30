// Pure, deterministic simulation: physics + goal/win rules.
// Host runs this authoritatively; guest just renders snapshots.

import { FIELD, PHYS, RULES } from "../config";
import type { Body, GameState, Input, Player, Role } from "../net/protocol";

const HW = FIELD.W / 2;
const HH = FIELD.H / 2;

export function createState(): GameState {
  const s: GameState = {
    phase: "waiting",
    timer: 0,
    ball: { x: 0, y: 0, vx: 0, vy: 0 },
    players: {
      host: mkPlayer(),
      guest: mkPlayer(),
    },
    score: { host: 0, guest: 0 },
    winner: null,
    scorer: null,
  };
  resetPositions(s);
  return s;
}

function mkPlayer(): Player {
  return { x: 0, y: 0, vx: 0, vy: 0, cd: 0, dash: false };
}

export function resetPositions(s: GameState) {
  s.ball = { x: 0, y: 0, vx: 0, vy: 0 };
  Object.assign(s.players.host, { x: -HW * 0.5, y: 0, vx: 0, vy: 0, cd: 0, dash: false });
  Object.assign(s.players.guest, { x: HW * 0.5, y: 0, vx: 0, vy: 0, cd: 0, dash: false });
}

export function startCountdown(s: GameState) {
  resetPositions(s);
  s.phase = "countdown";
  s.timer = RULES.countdown;
  s.scorer = null;
}

export function resetMatch(s: GameState) {
  s.score.host = 0;
  s.score.guest = 0;
  s.winner = null;
  startCountdown(s);
}

export function step(s: GameState, hostIn: Input, guestIn: Input, dt: number) {
  // ---- phase machine (sim frozen unless "playing") ----
  if (s.phase === "countdown") {
    s.timer -= dt;
    if (s.timer <= 0) {
      s.phase = "playing";
      s.timer = 0;
    }
    return;
  }
  if (s.phase === "goal") {
    s.timer -= dt;
    if (s.timer <= 0) startCountdown(s);
    return;
  }
  if (s.phase !== "playing") return;

  movePlayer(s.players.host, hostIn, dt);
  movePlayer(s.players.guest, guestIn, dt);
  separate(s.players.host, s.players.guest, PHYS.playerRadius + PHYS.playerRadius);

  // ---- ball ----
  const b = s.ball;
  const damp = Math.pow(PHYS.ballDamping, dt);
  b.vx *= damp;
  b.vy *= damp;
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  collideBall(b, s.players.host);
  collideBall(b, s.players.guest);
  clampBallSpeed(b);

  const r = PHYS.ballRadius;
  // top / bottom walls
  if (b.y > HH - r) {
    b.y = HH - r;
    b.vy = -Math.abs(b.vy) * PHYS.wallRestitution;
  } else if (b.y < -HH + r) {
    b.y = -HH + r;
    b.vy = Math.abs(b.vy) * PHYS.wallRestitution;
  }
  // left / right: goal opening or side wall
  if (b.x > HW - r) {
    if (Math.abs(b.y) < FIELD.goalHalf) return scoreGoal(s, "host");
    b.x = HW - r;
    b.vx = -Math.abs(b.vx) * PHYS.wallRestitution;
  } else if (b.x < -HW + r) {
    if (Math.abs(b.y) < FIELD.goalHalf) return scoreGoal(s, "guest");
    b.x = -HW + r;
    b.vx = Math.abs(b.vx) * PHYS.wallRestitution;
  }
}

function movePlayer(p: Player, inp: Input, dt: number) {
  p.dash = false;
  if (p.cd > 0) p.cd -= dt;

  const m = clampVec(inp.move);
  p.vx = approach(p.vx, m.x * PHYS.playerSpeed, PHYS.playerAccel * dt);
  p.vy = approach(p.vy, m.y * PHYS.playerSpeed, PHYS.playerAccel * dt);

  if (inp.kick && p.cd <= 0) {
    let dx = m.x;
    let dy = m.y;
    if (Math.hypot(dx, dy) < 0.05) {
      dx = p.vx;
      dy = p.vy; // no stick direction -> dash along current heading
    }
    const l = Math.hypot(dx, dy);
    if (l > 0.0001) {
      p.vx += (dx / l) * PHYS.kickImpulse;
      p.vy += (dy / l) * PHYS.kickImpulse;
      p.cd = PHYS.kickCooldown;
      p.dash = true;
    }
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // keep players on the pitch
  const pr = PHYS.playerRadius;
  p.x = clamp(p.x, -HW + pr, HW - pr);
  p.y = clamp(p.y, -HH + pr, HH - pr);
}

function collideBall(b: Body, p: Player) {
  const dx = b.x - p.x;
  const dy = b.y - p.y;
  const min = PHYS.ballRadius + PHYS.playerRadius;
  let dist = Math.hypot(dx, dy);
  if (dist >= min) return;
  if (dist < 1e-4) dist = 1e-4;

  const nx = dx / dist;
  const ny = dy / dist;
  // push ball out of overlap
  b.x = p.x + nx * min;
  b.y = p.y + ny * min;

  // ball leaves along the contact normal, energized by player speed (+ dash)
  const pvn = Math.max(0, p.vx * nx + p.vy * ny); // player speed toward ball
  const speed = PHYS.hitBase + pvn * PHYS.hitTransfer + (p.dash ? PHYS.ballKickBoost : 0);
  b.vx = nx * speed + p.vx * 0.25;
  b.vy = ny * speed + p.vy * 0.25;
}

function scoreGoal(s: GameState, scorer: Role) {
  s.score[scorer]++;
  s.scorer = scorer;
  s.ball.vx = 0;
  s.ball.vy = 0;
  if (s.score[scorer] >= RULES.winGoals) {
    s.phase = "won";
    s.winner = scorer;
    s.timer = 0;
  } else {
    s.phase = "goal";
    s.timer = RULES.goalPause;
  }
}

function separate(a: Body, b: Body, min: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= min || dist < 1e-4) return;
  const nx = dx / dist;
  const ny = dy / dist;
  const half = (min - dist) / 2;
  a.x -= nx * half;
  a.y -= ny * half;
  b.x += nx * half;
  b.y += ny * half;
}

function clampBallSpeed(b: Body) {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > PHYS.maxBallSpeed) {
    const k = PHYS.maxBallSpeed / sp;
    b.vx *= k;
    b.vy *= k;
  }
}

function approach(cur: number, target: number, maxDelta: number) {
  const d = target - cur;
  if (Math.abs(d) <= maxDelta) return target;
  return cur + Math.sign(d) * maxDelta;
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function clampVec(v: { x: number; y: number }) {
  const l = Math.hypot(v.x, v.y);
  return l > 1 ? { x: v.x / l, y: v.y / l } : v;
}
