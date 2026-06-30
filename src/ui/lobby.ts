// Pre-match overlay: start screen (host), QR + room code (host waiting),
// and "joining…" (guest). Hidden once the match begins.

import QRCode from "qrcode";
import { BRAND } from "../config";

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
