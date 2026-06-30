// Dev-only: capture loser + winner screens. Round A: host idle, ws guest chases
// -> host loses. Round B: host AI drives, guest idle -> host wins.
import puppeteer from "puppeteer";
import WebSocket from "ws";

const BASE = "http://localhost:5173";
const OUT = process.env.TEMP || ".";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const errs = [];
const host = await browser.newPage();
await host.setViewport({ width: 900, height: 440, deviceScaleFactor: 2 });
host.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errs.push("[console] " + m.text()); });
host.on("pageerror", (e) => errs.push("[pageerror] " + e.message));

await host.goto(BASE, { waitUntil: "networkidle0" });
await host.bringToFront();
await host.waitForSelector("#start");
await host.click("#start");
await host.waitForSelector(".code b");
const code = await host.$eval(".code b", (e) => e.textContent.trim());

let guestMode = "chase"; // chase | idle
const gw = new WebSocket("ws://localhost:8080/ws");
gw.on("open", () => gw.send(JSON.stringify({ t: "join", code })));
gw.on("message", (buf) => {
  const m = JSON.parse(buf.toString());
  if (m.t === "peer-msg" && m.payload.t === "teams") {
    if (m.payload.host && m.payload.guest == null)
      gw.send(JSON.stringify({ t: "msg", payload: { t: "pick", teamId: "tortas" } }));
  } else if (m.t === "peer-msg" && m.payload.t === "snapshot") {
    const s = m.payload.state;
    // idle = park in the bottom-left corner, far from the host's target (+x) goal
    let input = { move: { x: -1, y: -1 }, dash: false, kick: false };
    if (guestMode === "chase") {
      const dx = s.ball.x - s.players.guest.x, dy = s.ball.y - s.players.guest.y;
      const d = Math.hypot(dx, dy) || 1;
      input = { move: { x: dx / d, y: dy / d }, dash: false, kick: d < 1.4 };
    }
    gw.send(JSON.stringify({ t: "msg", payload: { t: "input", input } }));
  }
});

await host.waitForSelector("#grid .team-chip");
await host.click('.team-chip[data-id="guacamole"]');

// host AI driver (used in round B)
const held = new Set();
async function drive(dx, dy, kick) {
  const want = new Set();
  if (dx > 0.15) want.add("ArrowRight"); else if (dx < -0.15) want.add("ArrowLeft");
  if (dy > 0.15) want.add("ArrowUp"); else if (dy < -0.15) want.add("ArrowDown");
  if (kick) want.add(" ");
  for (const k of held) if (!want.has(k)) await host.keyboard.up(k);
  for (const k of want) if (!held.has(k)) await host.keyboard.down(k);
  held.clear(); for (const k of want) held.add(k);
}
async function releaseAll() { for (const k of held) await host.keyboard.up(k); held.clear(); }

async function playUntilWon(driveHost, limitMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < limitMs) {
    const gs = await host.evaluate(() => window.__gs?.());
    if (gs && gs.phase === "playing" && driveHost) {
      const me = gs.players.host, b = gs.ball;
      await drive(b.x - 0.55 - me.x, b.y - me.y, Math.hypot(b.x - me.x, b.y - me.y) < 1.4);
    } else if (driveHost) await drive(0, 0, false);
    if (gs && gs.phase === "won") return gs.winner;
    await sleep(50);
  }
  return null;
}

// ---- Round A: host loses ----
guestMode = "chase";
const winA = await playUntilWon(false, 60000);
await sleep(400);
const loseLine = await host.$eval(".win-line", (e) => e.textContent.trim()).catch(() => "(none)");
const loseTitle = await host.$eval(".win-title", (e) => e.textContent.trim()).catch(() => "");
await host.screenshot({ path: `${OUT}/10-loser.png` });
console.log("Round A winner:", winA, "| title:", loseTitle, "| line:", loseLine);

// rematch
await host.click("#rematch");
await sleep(800);

// ---- Round B: host wins ----
guestMode = "idle";
const winB = await playUntilWon(true, 110000);
await releaseAll();
await sleep(400);
const winLine = await host.$eval(".win-line", (e) => e.textContent.trim()).catch(() => "(none)");
const winTitle = await host.$eval(".win-title", (e) => e.textContent.trim()).catch(() => "");
await host.screenshot({ path: `${OUT}/11-winner.png` });
console.log("Round B winner:", winB, "| title:", winTitle, "| line:", winLine);

console.log("ERRORS:", errs.length ? "\n" + errs.join("\n") : "none");
const ok = loseLine === "Te toca pagar la cuenta!" && winLine === "Le toca a tu amigo invitar!" && !errs.length;
gw.close();
await browser.close();
process.exit(ok ? 0 : 1);
