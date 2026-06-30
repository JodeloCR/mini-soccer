import { describe, it, expect } from "vitest";
import { createState, step, startCountdown } from "./engine";
import { DEFAULT_INPUT, type GameState } from "../net/protocol";
import { FIELD, PHYS, RULES } from "../config";

const dt = PHYS.dt;
const idle = () => ({ move: { x: 0, y: 0 }, kick: false });

function playing(): GameState {
  const s = createState();
  startCountdown(s);
  // run out the countdown
  for (let i = 0; i < RULES.countdown * PHYS.tickHz + 2; i++) step(s, idle(), idle(), dt);
  expect(s.phase).toBe("playing");
  return s;
}

describe("engine", () => {
  it("freezes during countdown then plays", () => {
    const s = createState();
    startCountdown(s);
    expect(s.phase).toBe("countdown");
    step(s, idle(), idle(), dt);
    expect(s.ball.x).toBe(0); // frozen
  });

  it("bounces the ball off the top wall", () => {
    const s = playing();
    s.ball = { x: 0, y: FIELD.H / 2 - PHYS.ballRadius - 0.01, vx: 0, vy: 5 };
    step(s, idle(), idle(), dt);
    expect(s.ball.vy).toBeLessThan(0); // reversed downward
  });

  it("a player pushes the ball on contact", () => {
    const s = playing();
    s.ball = { x: 0, y: 0, vx: 0, vy: 0 };
    s.players.host = { x: -0.5, y: 0, vx: PHYS.playerSpeed, vy: 0, cd: 0, dash: false };
    step(s, { move: { x: 1, y: 0 }, kick: false }, idle(), dt);
    expect(s.ball.vx).toBeGreaterThan(0); // ball driven to the right
  });

  it("counts a goal when the ball enters the right goal", () => {
    const s = playing();
    s.ball = { x: FIELD.W / 2 - PHYS.ballRadius - 0.01, y: 0, vx: 8, vy: 0 };
    step(s, idle(), idle(), dt);
    expect(s.score.host).toBe(1);
    expect(s.scorer).toBe("host");
    expect(s.phase).toBe("goal");
  });

  it("a shot into the side wall (outside the opening) does not score", () => {
    const s = playing();
    s.ball = { x: FIELD.W / 2 - PHYS.ballRadius - 0.01, y: FIELD.goalHalf + 1, vx: 8, vy: 0 };
    step(s, idle(), idle(), dt);
    expect(s.score.host).toBe(0);
    expect(s.ball.vx).toBeLessThan(0); // bounced back
  });

  it("declares a winner at winGoals", () => {
    const s = playing();
    s.score.host = RULES.winGoals - 1;
    s.ball = { x: FIELD.W / 2 - PHYS.ballRadius - 0.01, y: 0, vx: 8, vy: 0 };
    step(s, idle(), idle(), dt);
    expect(s.phase).toBe("won");
    expect(s.winner).toBe("host");
  });

  it("uses DEFAULT_INPUT shape", () => {
    expect(DEFAULT_INPUT.kick).toBe(false);
  });
});
