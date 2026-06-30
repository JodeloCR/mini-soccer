# Huateque Mini Fútbol ⚽

3D top-down **1v1 soccer** for two phones, made for a restaurant table. One
customer starts a match and shows a **QR**; the other scans it to join. **First
to 5 goals wins.** No app install — just a URL.

## How it works

- **Host** (the phone that taps *Crear partida*) runs the authoritative physics
  at a fixed 30 Hz tick and broadcasts snapshots.
- **Guest** scans the QR, streams its input, and renders interpolated snapshots.
- **Transport:** always connects over a **WebSocket relay** (works on any
  network), then tries to upgrade to a direct **WebRTC P2P** datachannel. If P2P
  fails (strict NAT / no TURN), it stays on the relay — the game never breaks.
  The HUD badge shows `relay` or `P2P`.

## Controls

Left thumb = move (dynamic joystick, appears where you touch). Right thumb =
**KICK** (dash + harder hit, short cooldown). Desktop: WASD/arrows + space.

## Run locally

Two processes (Vite proxies `/ws` to the game server):

```bash
npm install
npm run server:dev      # game/WS server on :8080
npm run dev             # Vite client on :5173
```

Open `http://localhost:5173` → *Crear partida* → note the code, then open a
second tab at `http://localhost:5173/?room=CODE`. Or test on phones over LAN
using the machine's IP (Vite is exposed on the network).

## Test / typecheck / build

```bash
npm test          # vitest — engine physics + rules
npm run typecheck # tsc --noEmit
npm run build     # vite build -> dist/
```

## Deploy (Render free web service)

One service serves both the static client and the WebSocket:

- **Build command:** `npm install && npm run build`
- **Start command:** `npm start` (runs `tsx server/index.ts`, serves `dist/` + `/ws`)
- Render injects `PORT`; the server reads it. WebSockets + HTTPS work out of the box.

> Free tier sleeps after ~15 min idle (≈30 s cold start on first load). For
> daily restaurant use, upgrade to an always-on instance (Render paid or Fly.io).

## Branding

Everything is in [`src/config.ts`](src/config.ts): `BRAND` name/colors, `TEAM`
colors/names, field size, physics tuning, `RULES.winGoals`. Drop a transparent
`public/logo.png` to paint the restaurant logo on the center circle (optional —
it's skipped gracefully if absent).

## Layout

```
server/index.ts     express static + ws rooms (signaling + relay)
src/config.ts       tuning + branding (single source)
src/net/protocol.ts shared message/state types
src/net/transport.ts ws + webrtc upgrade w/ relay fallback
src/game/engine.ts  pure physics + goal/win rules (tested)
src/game/scene.ts   three.js pitch/goals/ball/players + camera
src/game/render.ts  guest snapshot interpolation buffer
src/game/input.ts   touch joystick + kick (+ keyboard)
src/ui/lobby.ts     start / QR / joining / error
src/ui/hud.ts       score, countdown, GOAL, win, rematch
src/main.ts         wires it all together
```
