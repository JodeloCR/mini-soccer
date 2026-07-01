import puppeteer from "puppeteer";
const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox","--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader","--ignore-gpu-blocklist"] });
const p = await b.newPage();
await p.setViewport({ width: 900, height: 620, deviceScaleFactor: 2 });
const errs = [];
p.on("pageerror", (e) => { if (!/admin mode|stickers mode/.test(e.message)) errs.push(e.message); });
await p.goto("http://localhost:5173/?admin=huateque123", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 600));
const stats = await p.$eval(".admin-stats", (e) => e.textContent.replace(/\s+/g, " ").trim()).catch(() => "(none)");
await p.screenshot({ path: (process.env.TEMP || ".") + "/13-admin.png" });
// attract mode: lobby with demo behind
const p2 = await b.newPage();
await p2.setViewport({ width: 900, height: 440, deviceScaleFactor: 2 });
p2.on("pageerror", (e) => errs.push(e.message));
await p2.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 6500)); // let the demo play past countdown
await p2.screenshot({ path: (process.env.TEMP || ".") + "/14-attract.png" });
console.log("admin stats:", stats);
console.log("errors:", errs.length ? errs.join("; ") : "none");
await b.close();
process.exit(errs.length ? 1 : 0);
