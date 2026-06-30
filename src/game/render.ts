// Guest-side snapshot buffer. Host snapshots arrive at ~30 Hz; we render a
// little in the past and interpolate between the two surrounding snapshots so
// motion stays smooth despite network jitter.

import type { Body, GameState } from "../net/protocol";

const RENDER_DELAY = 90; // ms behind the latest snapshot

export class SnapshotBuffer {
  private buf: { t: number; s: GameState }[] = [];

  push(s: GameState, now: number) {
    this.buf.push({ t: now, s });
    if (this.buf.length > 30) this.buf.shift();
  }

  latest(): GameState | null {
    return this.buf.length ? this.buf[this.buf.length - 1].s : null;
  }

  /** Interpolated state for `now`, or null if nothing buffered yet. */
  sample(now: number): GameState | null {
    if (this.buf.length === 0) return null;
    const target = now - RENDER_DELAY;
    let a = this.buf[0];
    let b = this.buf[this.buf.length - 1];
    for (let i = 0; i < this.buf.length - 1; i++) {
      if (this.buf[i].t <= target && this.buf[i + 1].t >= target) {
        a = this.buf[i];
        b = this.buf[i + 1];
        break;
      }
    }
    if (a === b || b.t === a.t) return b.s;
    const f = clamp01((target - a.t) / (b.t - a.t));
    return lerpState(a.s, b.s, f);
  }
}

function lerpState(a: GameState, b: GameState, f: number): GameState {
  return {
    ...b, // discrete fields (phase, score, timer, winner, scorer) snap to newest
    ball: lerpBody(a.ball, b.ball, f),
    players: {
      host: { ...b.players.host, ...lerpBody(a.players.host, b.players.host, f) },
      guest: { ...b.players.guest, ...lerpBody(a.players.guest, b.players.guest, f) },
    },
  };
}

function lerpBody(a: Body, b: Body, f: number): Body {
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    vx: b.vx,
    vy: b.vy,
  };
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
