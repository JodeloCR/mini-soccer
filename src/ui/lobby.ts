// Pre-match overlay: start screen (host), QR + room code (host waiting),
// and "joining…" (guest). Hidden once the match begins.

import QRCode from "qrcode";
import { BRAND, TEAMS } from "../config";

export class Lobby {
  private el: HTMLElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "overlay lobby";
    root.appendChild(this.el);
  }

  showStart(onStart: () => void) {
    this.el.style.display = "flex";
    this.el.innerHTML = `
      <div class="card">
        <img class="lobby-logo" src="${BRAND.logoPath}" alt="" onerror="this.remove()">
        <div class="logo-title">${BRAND.name}</div>
        <div class="subtitle">${BRAND.tagline}</div>
        <p class="hint">Fútbol 1v1 · primero a 5 goles</p>
        <button class="big-btn" id="start">Crear partida</button>
        <p class="fineprint">El otro jugador escanea el QR para unirse</p>
      </div>`;
    (this.el.querySelector("#start") as HTMLElement).onclick = onStart;
  }

  async showHostWaiting(code: string) {
    const url = `${location.origin}/?room=${code}`;
    this.el.style.display = "flex";
    this.el.innerHTML = `
      <div class="card">
        <div class="subtitle">Escanea para unirte</div>
        <canvas id="qr" class="qr"></canvas>
        <div class="code">Código: <b>${code}</b></div>
        <p class="hint waiting">Esperando al jugador 2…</p>
      </div>`;
    try {
      await QRCode.toCanvas(this.el.querySelector("#qr"), url, {
        width: 240,
        margin: 1,
        color: { dark: "#0a2e17", light: "#ffffff" },
      });
    } catch {
      /* QR render failed — code text is still shown */
    }
  }

  showJoining(code: string) {
    this.el.style.display = "flex";
    this.el.innerHTML = `
      <div class="card">
        <div class="subtitle">${BRAND.name} ${BRAND.tagline}</div>
        <p class="hint waiting">Conectando a la sala <b>${code}</b>…</p>
      </div>`;
  }

  // --- team selection ---
  private onPick: (teamId: string) => void = () => {};

  showSelect(onPick: (teamId: string) => void) {
    this.onPick = onPick;
    this.el.style.display = "flex";
    this.el.innerHTML = `
      <div class="card select">
        <div class="subtitle">Elegí tu equipo</div>
        <div class="teamgrid" id="grid"></div>
        <p class="hint" id="selhint">Tocá un platillo</p>
      </div>`;
    this.renderSelect(null, null);
  }

  /** mine/opp = chosen team ids (null if unchosen). Opponent's team is locked. */
  renderSelect(mine: string | null, opp: string | null) {
    const grid = this.el.querySelector("#grid");
    if (!grid) return;
    grid.innerHTML = TEAMS.map((t) => {
      const isMine = t.id === mine;
      const isOpp = t.id === opp;
      const cls = ["team-chip", isMine ? "mine" : "", isOpp ? "taken" : ""].join(" ").trim();
      return `<button class="${cls}" data-id="${t.id}" ${isOpp ? "disabled" : ""}>
          <span class="swatch" style="background:${t.color}"></span>
          <span class="tname">${t.name}</span>
        </button>`;
    }).join("");
    grid.querySelectorAll<HTMLButtonElement>(".team-chip").forEach((btn) => {
      btn.onclick = () => {
        if (btn.disabled) return;
        this.onPick(btn.dataset.id!);
      };
    });
    const hint = this.el.querySelector("#selhint");
    if (hint) {
      hint.textContent = !mine
        ? "Tocá un platillo"
        : !opp
          ? "Esperando al rival…"
          : "¡Listos! Arrancando…";
      hint.classList.toggle("waiting", !!mine && !opp);
    }
  }

  showError(msg: string) {
    this.el.style.display = "flex";
    this.el.innerHTML = `
      <div class="card">
        <div class="subtitle">Ups</div>
        <p class="hint">${msg}</p>
        <button class="big-btn" id="again">Reintentar</button>
      </div>`;
    (this.el.querySelector("#again") as HTMLElement).onclick = () => location.reload();
  }

  hide() {
    this.el.style.display = "none";
  }
}
