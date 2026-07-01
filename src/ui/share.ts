// Shareable result card: composes a PNG on a canvas and hands it to the Web
// Share API (falls back to a download). Every loss shared = free marketing.

import { BRAND } from "../config";

export interface ShareData {
  iWon: boolean;
  myTeam: { name: string; color: string };
  oppTeam: { name: string; color: string };
  myScore: number;
  oppScore: number;
}

export async function shareResult(d: ShareData) {
  const W = 1080;
  const H = 1080;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;

  // background
  const bg = g.createRadialGradient(W / 2, 0, 200, W / 2, H / 2, H);
  bg.addColorStop(0, "#0f4a25");
  bg.addColorStop(1, "#06180d");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // confetti sprinkles
  const colors = [d.myTeam.color, d.oppTeam.color, BRAND.accent, "#ffffff"];
  for (let i = 0; i < 90; i++) {
    g.save();
    g.translate(Math.random() * W, Math.random() * H);
    g.rotate(Math.random() * Math.PI);
    g.globalAlpha = 0.25 + Math.random() * 0.4;
    g.fillStyle = colors[i % colors.length];
    g.fillRect(-8, -4, 16, 8);
    g.restore();
  }
  g.globalAlpha = 1;

  // optional logo
  await drawLogo(g, W / 2, 150);

  g.textAlign = "center";
  g.fillStyle = BRAND.accent;
  g.font = "900 64px system-ui, sans-serif";
  g.fillText(`${BRAND.name} ${BRAND.tagline}`.toUpperCase(), W / 2, 300);

  g.fillStyle = "#ffffff";
  g.font = "900 130px system-ui, sans-serif";
  g.fillText(d.iWon ? "🏆 ¡GANÉ!" : "😭 PERDÍ", W / 2, 470);

  g.fillStyle = BRAND.accent;
  g.font = "800 56px system-ui, sans-serif";
  g.fillText(d.iWon ? "¡Le toca a mi amigo invitar!" : "¡Me toca pagar la cuenta!", W / 2, 560);

  // score row with team color dots
  g.font = "900 84px system-ui, sans-serif";
  g.fillStyle = "#ffffff";
  g.fillText(`${d.myScore}  -  ${d.oppScore}`, W / 2, 700);
  g.font = "700 44px system-ui, sans-serif";
  dot(g, W / 2 - 260, 760, d.myTeam.color);
  g.fillStyle = "#ffffff";
  g.textAlign = "left";
  g.fillText(d.myTeam.name, W / 2 - 230, 775);
  dot(g, W / 2 + 90, 760, d.oppTeam.color);
  g.fillText(d.oppTeam.name, W / 2 + 120, 775);
  g.textAlign = "center";

  g.fillStyle = "rgba(255,255,255,0.75)";
  g.font = "600 40px system-ui, sans-serif";
  g.fillText("Retá a tus amigos — escaneá el QR en la mesa 🌮", W / 2, 950);

  const blob: Blob | null = await new Promise((r) => cv.toBlob(r, "image/png"));
  if (!blob) return;
  const file = new File([blob], "huateque-futbol.png", { type: "image/png" });
  const text = d.iWon
    ? `¡Gané ${d.myScore}-${d.oppScore} en ${BRAND.name} Mini Fútbol! 🏆`
    : `Perdí ${d.myScore}-${d.oppScore} en ${BRAND.name} Mini Fútbol… me toca pagar la cuenta 😭`;

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return;
    } catch {
      /* user cancelled — fall through to download */
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "huateque-futbol.png";
  a.click();
  URL.revokeObjectURL(a.href);
}

function dot(g: CanvasRenderingContext2D, x: number, y: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, 18, 0, Math.PI * 2);
  g.fill();
}

function drawLogo(g: CanvasRenderingContext2D, cx: number, cy: number): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = () => resolve();
    const t = setTimeout(done, 800); // don't block the share on a slow/missing logo
    img.onload = () => {
      clearTimeout(t);
      const s = 180;
      g.drawImage(img, cx - s / 2, cy - s / 2, s, s);
      done();
    };
    img.onerror = () => {
      clearTimeout(t);
      done();
    };
    img.src = BRAND.logoPath;
  });
}
