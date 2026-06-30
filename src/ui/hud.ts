// In-match overlay: scoreboard, kickoff countdown, GOAL flash, win screen +
// rematch, transport badge, and a portrait "rotate your phone" hint.

import { TEAM, type TeamDef } from "../config";
import type { GameState, Role } from "../net/protocol";

export class Hud {
  private el: HTMLElement;
  private myRole: Role = "host";
  private onRematch: () => void = () => {};
  private lastPhase = "";
  private lastScorer: Role | null = null;
  private teams: { host: { name: string; color: string }; guest: { name: string; color: string } } = {
    host: TEAM.host,
    guest: TEAM.guest,
  };

  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "hud";
    this.el.innerHTML = `
      <div class="scoreboard">
        <span class="team host"><i></i>${TEAM.host.name} <b id="sh">0</b></span>
        <span class="sep">:</span>
        <span class="team guest"><b id="sg">0</b> ${TEAM.guest.name}<i></i></span>
      </div>
      <div class="badge" id="net">relay</div>
      <div class="center-msg" id="msg"></div>
      <div class="rotate">↻ Gira el teléfono</div>`;
    root.appendChild(this.el);
    this.styleTeamChips();
  }

  setRole(role: Role, onRematch: () => void) {
    this.myRole = role;
    this.onRematch = onRematch;
  }

  setTeams(host: TeamDef, guest: TeamDef) {
    this.teams = { host, guest };
    (this.el.querySelector(".team.host") as HTMLElement).innerHTML =
      `<i></i>${host.name} <b id="sh">0</b>`;
    (this.el.querySelector(".team.guest") as HTMLElement).innerHTML =
      `<b id="sg">0</b> ${guest.name}<i></i>`;
    this.styleTeamChips();
  }

  setTransport(kind: string) {
    const b = this.el.querySelector("#net") as HTMLElement;
    b.textContent = kind === "p2p" ? "P2P" : "relay";
    b.classList.toggle("p2p", kind === "p2p");
  }

  update(s: GameState) {
    (this.el.querySelector("#sh") as HTMLElement).textContent = String(s.score.host);
    (this.el.querySelector("#sg") as HTMLElement).textContent = String(s.score.guest);
    const msg = this.el.querySelector("#msg") as HTMLElement;

    // brief GOAL flash when a new goal is scored
    if (s.scorer && (s.phase === "goal" || s.phase === "won") && this.lastScorer !== s.scorer) {
      this.flashGoal();
    }
    this.lastScorer = s.phase === "playing" ? null : s.scorer;

    if (s.phase === "countdown") {
      msg.className = "center-msg show count";
      msg.textContent = String(Math.ceil(s.timer));
    } else if (s.phase === "goal") {
      msg.className = "center-msg show goal";
      msg.innerHTML = `¡GOOOL!<br><small>${this.teamName(s.scorer)}</small>`;
    } else if (s.phase === "won") {
      this.showWin(s);
      return;
    } else {
      msg.className = "center-msg";
      msg.textContent = "";
    }
    this.lastPhase = s.phase;
  }

  private showWin(s: GameState) {
    const msg = this.el.querySelector("#msg") as HTMLElement;
    if (this.lastPhase === "won") return; // already rendered
    this.lastPhase = "won";
    const iWon = s.winner === this.myRole;
    const score = `${s.score[s.winner!]} - ${s.score[other(s.winner!)]}`;
    msg.className = `center-msg show win ${iWon ? "victory" : "defeat"}`;
    msg.innerHTML = iWon
      ? `
        <div class="win-emoji">🎉🏆</div>
        <div class="win-title">¡GANASTE!</div>
        <div class="win-line">Le toca a tu amigo invitar!</div>
        <div class="win-sub">${this.teamName(s.winner)} · ${score}</div>
        <button class="big-btn" id="rematch">Revancha</button>`
      : `
        <div class="win-emoji">💸🧾</div>
        <div class="win-title">¡Perdiste!</div>
        <div class="win-line">Te toca pagar la cuenta!</div>
        <div class="win-sub">${this.teamName(s.winner)} ganó ${score}</div>
        <button class="big-btn" id="rematch">Revancha</button>`;
    (msg.querySelector("#rematch") as HTMLElement).onclick = () => this.onRematch();
  }

  private flashGoal() {
    this.el.classList.add("goal-flash");
    setTimeout(() => this.el.classList.remove("goal-flash"), 500);
  }

  private teamName(r: Role | null) {
    return r ? this.teams[r].name : "";
  }

  private styleTeamChips() {
    const chips = this.el.querySelectorAll(".team i");
    (chips[0] as HTMLElement).style.background = this.teams.host.color;
    (chips[1] as HTMLElement).style.background = this.teams.guest.color;
  }
}

function other(r: Role): Role {
  return r === "host" ? "guest" : "host";
}
