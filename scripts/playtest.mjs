// Dev-only: full-match bug hunt. Host = a real foregrounded browser page
// (authoritative sim + real rematch button); guest = a headless ws client.
// Both AIs chase the ball; play runs to a win, then the rematch button is
// exercised. Reports console/page errors + anomalies.
import puppeteer from "puppeteer";
import WebSocket from "ws";

const BASE = "http://localhost:5173";
const OUT = process.env.TEMP || ".";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: "new",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--ignore-gpu-blocklist",
  ],
});

const errs = [];
const host = await browser.newPage();
await host.setViewport({ width: 820, height: 400, deviceScaleFactor: 1 });
host.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("404")) errs.push("[console] " + m.text());
});
host.on("pageerror", (e) => errs.push("[pageerror] " + e.message));

await host.goto(BASE, { waitUntil: "networkidle0" });
await host.bringToFront(); // keep authoritative rAF un-throttled
await host.waitForSelector("#start");
await host.click("#start");
await host.waitForSelector(".code b");
const code = await host.$eval(".code b", (e) => e.textContent.trim());

// ---- headless guest over ws (mirrors transport's relay path) ----
const IDS = ["guacamole", "tortas", "pastor", "varios", "campechanos", "sopes", "enchipotladas"];
let guestPicked = false;
const gw = new WebSocket("ws://localhost:8080/ws");
gw.on("open", () => gw.send(JSON.stringify({ t: "join", code })));
gw.on("message", (buf) => {
  const m = JSON.parse(buf.toString());
  if (m.t === "peer-msg" && m.payload.t === "teams") {
    // pick any team that differs from the host's once the host has chosen
    if (m.payload.host && !guestPicked) {
      guestPicked = true;
      const other = IDS.find((id) => id !== m.payload.host);
      gw.send(JSON.stringify({ t: "msg", payload: { t: "pick", teamId: other } }));
    }
  } else if (m.t === "peer-msg" && m.payload.t === "snapshot") {
    const s = m.payload.state;
    const dx = s.ball.x - s.players.guest.x;
    const dy = s.ball.y - s.players.guest.y;
    const d = Math.hypot(dx, dy) || 1;
    gw.send(
      JSON.stringify({
        t: "msg",
        payload: { t: "input", input: { move: { x: dx / d, y: dy / d }, kick: d < 1.4 } },
      }),
    );
  }
});

// ---- host AI via keyboard ----
const held = new Set();
async function drive(dx, dy, kick) {
  const want = new Set();
  if (dx > 0.15) want.add("ArrowRight");
  else if (dx < -0.15) want.add("ArrowLeft");
  if (dy > 0.15) want.add("ArrowUp");
  else if (dy < -0.15) want.add("ArrowDown");
  if (kick) want.add(" ");
  for (const k of held) if (!want.has(k)) await host.keyboard.up(k);
  for (const k of want) if (!held.has(k)) await host.keyboard.down(k);
  held.clear();
  for (const k of want) held.add(k);
}

// host picks a team -> triggers guest pick -> match starts
await host.waitForSelector("#grid .team-chip");
await host.click('.team-chip[data-id="guacamole"]');

let last = null;
let won = null;
const t0 = Date.now();
while (Date.now() - t0 < 90000) {
  const gs = await host.evaluate(() => window.__gs?.());
  if (gs) {
    if (gs.phase === "playing") {
      const me = gs.players.host;
      const b = gs.ball;
      const dx = b.x - 0.55 - me.x; // get behind ball, push toward +x goal
      const dy = b.y - me.y;
      const near = Math.hypot(b.x - me.x, b.y - me.y) < 1.4;
      await drive(dx, dy, near);
    } else {
      await drive(0, 0, false);
    }
    if (!last || last.score.host !== gs.score.host || last.score.guest !== gs.score.guest)
      console.log(`score ${gs.score.host}-${gs.score.guest}  phase ${gs.phase}`);
    last = gs;
    if (gs.phase === "won") {
      won = gs;
      break;
    }
  }
  await sleep(50);
}
await drive(0, 0, false);

console.log("WINNER:", won ? won.winner : "(none - timeout)");
await host.screenshot({ path: `${OUT}/06-win.png` });

let rematchOk = false;
if (won) {
  const btn = await host.$("#rematch");
  if (btn) {
    await btn.click();
    await sleep(900);
    const after = await host.evaluate(() => window.__gs?.());
    rematchOk = after && after.score.host === 0 && after.score.guest === 0 && after.phase !== "won";
    console.log("after rematch:", after && `${after.score.host}-${after.score.guest} ${after.phase}`);
  } else console.log("NO #rematch button");
}
console.log("REMATCH_OK:", rematchOk);
console.log("ERRORS:", errs.length ? "\n" + errs.join("\n") : "none");

gw.close();
await browser.close();
process.exit(errs.length || !won || !rematchOk ? 1 : 0);
