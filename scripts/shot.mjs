// Dev-only: drive two real browser pages (host + guest) through Chromium and
// capture screenshots of the lobby/QR and the live 3D pitch.
import puppeteer from "puppeteer";

const BASE = "http://localhost:5173";
const OUT = process.argv[2] || ".";
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
async function newPage() {
  const p = await browser.newPage();
  await p.setViewport({ width: 820, height: 400, deviceScaleFactor: 2 });
  p.on("console", (m) => {
    if (m.type() === "error") errs.push("[console] " + m.text());
  });
  p.on("pageerror", (e) => errs.push("[pageerror] " + e.message));
  return p;
}

// ---- host ----
const host = await newPage();
await host.goto(BASE, { waitUntil: "networkidle0" });
await host.waitForSelector("#start", { timeout: 8000 });
await host.screenshot({ path: `${OUT}/01-host-start.png` });

await host.click("#start");
await host.waitForSelector(".code b", { timeout: 8000 });
const code = await host.$eval(".code b", (el) => el.textContent.trim());
console.log("ROOM CODE:", code);
await sleep(400);
await host.screenshot({ path: `${OUT}/02-host-qr.png` });

// ---- guest joins ----
const guest = await newPage();
await guest.goto(`${BASE}/?room=${code}`, { waitUntil: "networkidle0" });

// let countdown (3s) run and play begin
await sleep(5000);
await host.screenshot({ path: `${OUT}/03-host-pitch.png` });
await guest.screenshot({ path: `${OUT}/04-guest-pitch.png` });

// read live state straight off the host's scoreboard + transport badge
const scoreboard = await host.$eval(".scoreboard", (el) => el.textContent.replace(/\s+/g, " ").trim());
const badge = await host.$eval("#net", (el) => el.textContent.trim());
console.log("SCOREBOARD:", scoreboard);
console.log("TRANSPORT:", badge);

console.log("CONSOLE ERRORS:", errs.length ? "\n" + errs.join("\n") : "none");
await browser.close();
process.exit(errs.length ? 1 : 0);
