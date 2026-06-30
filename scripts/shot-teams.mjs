// Dev-only: verify team selection. Host (browser) picks a team; ws guest first
// tries to grab the host's team (must be rejected), then picks a different one;
// match starts with colored players + team names. Screenshots select + pitch.
import puppeteer from "puppeteer";
import WebSocket from "ws";

const BASE = "http://localhost:5173";
const OUT = process.env.TEMP || ".";
const IDS = ["guacamole", "tortas", "pastor", "varios", "campechanos", "sopes", "enchipotladas"];
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

// ws guest with the pick handshake
let hostPick = null, guestPick = null, triedConflict = false, pickedFinal = false;
const gw = new WebSocket("ws://localhost:8080/ws");
gw.on("open", () => gw.send(JSON.stringify({ t: "join", code })));
gw.on("message", (buf) => {
  const m = JSON.parse(buf.toString());
  if (m.t === "peer-msg" && m.payload.t === "teams") {
    hostPick = m.payload.host; guestPick = m.payload.guest;
    if (hostPick && !triedConflict) {
      triedConflict = true;
      gw.send(JSON.stringify({ t: "msg", payload: { t: "pick", teamId: hostPick } })); // expect reject
    } else if (hostPick && guestPick == null && triedConflict && !pickedFinal) {
      pickedFinal = true;
      const other = IDS.find((id) => id !== hostPick);
      gw.send(JSON.stringify({ t: "msg", payload: { t: "pick", teamId: other } }));
    }
  } else if (m.t === "peer-msg" && m.payload.t === "snapshot") {
    const s = m.payload.state; const dx = s.ball.x - s.players.guest.x; const dy = s.ball.y - s.players.guest.y;
    const d = Math.hypot(dx, dy) || 1;
    gw.send(JSON.stringify({ t: "msg", payload: { t: "input", input: { move: { x: dx / d, y: dy / d }, kick: d < 1.4 } } }));
  }
});

// host sees select screen
await host.waitForSelector("#grid .team-chip");
await sleep(300);
await host.screenshot({ path: `${OUT}/07-select.png` });

// host picks Guacamole
await host.click('.team-chip[data-id="guacamole"]');

// wait for conflict-reject + final pick + match start
await sleep(2500);
const conflictRejected = guestPick !== "guacamole"; // host's team never assigned to guest
await host.screenshot({ path: `${OUT}/08-countdown.png` });
await sleep(3500);
const scoreboard = await host.$eval(".scoreboard", (e) => e.textContent.replace(/\s+/g, " ").trim());
const phase = await host.evaluate(() => window.__gs?.()?.phase);
await host.screenshot({ path: `${OUT}/09-teams-pitch.png` });

console.log("guest final team:", guestPick);
console.log("conflict rejected (guest != host team):", conflictRejected);
console.log("scoreboard:", scoreboard);
console.log("phase:", phase);
console.log("ERRORS:", errs.length ? "\n" + errs.join("\n") : "none");

const ok = conflictRejected && /Guacamole/.test(scoreboard) && guestPick && guestPick !== "guacamole" && (phase === "playing" || phase === "countdown") && !errs.length;
gw.close();
await browser.close();
process.exit(ok ? 0 : 1);
