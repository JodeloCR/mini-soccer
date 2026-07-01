// Printable table-sticker sheet: open /?stickers=6, hit Imprimir, done.
// Each card: brand, QR to the game URL, hook line. Browser print -> PDF.

import QRCode from "qrcode";
import { BRAND } from "../config";

export async function renderStickers(root: HTMLElement, count: number) {
  document.body.classList.add("print-mode");
  root.innerHTML = `
    <div class="stickers-page">
      <div class="stickers-toolbar no-print">
        <b>${count} stickers</b> — imprimí esta hoja (o guardá como PDF)
        <button class="big-btn" id="print">Imprimir 🖨️</button>
      </div>
      <div class="stickers-grid" id="grid"></div>
    </div>`;
  (root.querySelector("#print") as HTMLElement).onclick = () => window.print();

  const grid = root.querySelector("#grid")!;
  const url = location.origin;
  for (let i = 0; i < count; i++) {
    const card = document.createElement("div");
    card.className = "sticker";
    card.innerHTML = `
      <div class="s-brand">${BRAND.name}</div>
      <div class="s-tag">${BRAND.tagline} ⚽</div>
      <canvas></canvas>
      <div class="s-hook">Escaneá y retá a tu amigo</div>
      <div class="s-sub">El que pierde paga la cuenta 😉</div>`;
    grid.appendChild(card);
    await QRCode.toCanvas(card.querySelector("canvas"), url, {
      width: 180,
      margin: 1,
      color: { dark: "#06180d", light: "#ffffff" },
    });
  }
}
