// FX director: watches GameState transitions each frame and fires the matching
// sound / camera shake / vibration. Pure observer — no game logic.

import { FIELD, PHYS } from "../config";
import type { GameState, Role } from "../net/protocol";
import type { Sfx } from "./audio";
import type { Scene3D } from "./scene";

interface PrevLite {
  phase: GameState["phase"];
  ball: { x: number; y: number; vx: number; vy: number };
  hostKick: boolean;
  guestKick: boolean;
  hostDash: boolean;
  guestDash: boolean;
}

export class FxDirector {
  private prev: PrevLite | null = null;
  private prevCeil = -1;
  private myRole: Role = "host";

  constructor(
    private sfx: Sfx,
    private scene: Scene3D,
  ) {}

  setRole(r: Role) {
    this.myRole = r;
  }

  update(s: GameState) {
    const p = this.prev;
    if (p) {
      // kicks + dashes (transient flags set by the engine for one tick)
      for (const r of ["host", "guest"] as const) {
        const kickNow = s.players[r].kicking;
        const kickPrev = r === "host" ? p.hostKick : p.guestKick;
        if (kickNow && !kickPrev) {
          this.sfx.kick();
          this.scene.shake(0.15);
          if (r === this.myRole) navigator.vibrate?.(25);
        }
        const dashNow = s.players[r].dashing;
        const dashPrev = r === "host" ? p.hostDash : p.guestDash;
        if (dashNow && !dashPrev) this.sfx.dash();
      }

      // wall bounce: velocity sign flip while at a wall
      const sp = Math.hypot(p.ball.vx, p.ball.vy);
      if (sp > 2.5) {
        const nearY = Math.abs(s.ball.y) > FIELD.H / 2 - PHYS.ballRadius - 0.25;
        const nearX = Math.abs(s.ball.x) > FIELD.W / 2 - PHYS.ballRadius - 0.25;
        if ((nearY && Math.sign(s.ball.vy) !== Math.sign(p.ball.vy) && p.ball.vy !== 0) ||
            (nearX && Math.sign(s.ball.vx) !== Math.sign(p.ball.vx) && p.ball.vx !== 0)) {
          this.sfx.bounce(sp);
          this.scene.shake(Math.min(0.1, sp * 0.008));
        }
      }

      // goal / win
      if ((s.phase === "goal" || s.phase === "won") && p.phase === "playing") {
        this.sfx.goal();
        this.scene.shake(0.6);
        this.scene.fovPunch();
        navigator.vibrate?.(s.phase === "won" ? [120, 60, 120] : 90);
        if (s.phase === "won") {
          if (s.winner === this.myRole) this.sfx.win();
          else this.sfx.lose();
        }
      }

      // countdown beeps
      if (s.phase === "countdown") {
        const c = Math.ceil(s.timer);
        if (c !== this.prevCeil) {
          this.sfx.beep(false);
          this.prevCeil = c;
        }
      } else {
        if (p.phase === "countdown" && s.phase === "playing") this.sfx.beep(true);
        this.prevCeil = -1;
      }
    }

    this.prev = {
      phase: s.phase,
      ball: { x: s.ball.x, y: s.ball.y, vx: s.ball.vx, vy: s.ball.vy },
      hostKick: s.players.host.kicking,
      guestKick: s.players.guest.kicking,
      hostDash: s.players.host.dashing,
      guestDash: s.players.guest.dashing,
    };
  }
}
