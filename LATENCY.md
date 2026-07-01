# Latency: how to actually get sub-60ms

## The one thing that matters: direct P2P on the same WiFi

When both phones are on the **same network** (the restaurant WiFi), WebRTC
connects **directly** (via local ICE candidates). Traffic never leaves the
building → **~2–10ms**. This is the intended setup and it's already sub-60ms with
zero extra infrastructure.

Check the badge (top-right in a match):

- **P2P** → direct connection. Low latency. 👍
- **relay** → traffic is bouncing through the server. High latency.

**➡ To hit sub-60ms: put both phones on the restaurant WiFi and confirm the badge says P2P.**

## Why a relay can't be sub-60ms from Costa Rica

Relay = `phone → server → phone`. Even a server in Miami is ~40–60ms one-way from
CR, so a round trip through it is ~80–120ms. **No relay (or TURN) can beat direct
P2P.** A closer region helps the *handshake* and makes the fallback less bad, but
it does not make relayed play sub-60ms.

## What TURN actually does

TURN is a **connectivity** fallback for when two phones can't punch through their
NATs (some cellular/corporate networks). It **relays** traffic, so it's the *slow*
path, used only when direct P2P fails. Adding TURN does **not** lower latency on
the good path — `iceTransportPolicy` stays `all`, so direct P2P is always tried
first and TURN is last resort.

Enable TURN by setting env vars on the host (no code change needed — the server's
`/ice` endpoint picks them up):

```
TURN_URL=turn:your-turn-host:3478
TURN_USER=someuser
TURN_PASS=somepass
```
(`TURN_URL` may be a comma-separated list, e.g. add `turns:...:5349` for TLS.)

### Option A — managed TURN (5 min, recommended if you want a safety net)
Use a provider like **Metered** (metered.ca, free tier) or **Twilio**. They give
you a URL + username + credential → set them as the three env vars above.

### Option B — self-host coturn near CR (Fly.io `qro`)
Run coturn as its own Fly app in Querétaro. Sketch:
```bash
flyctl launch --image coturn/coturn --region qro --name huateque-turn --no-deploy
# set a shared secret / static creds, expose UDP 3478 + relay range in fly.toml
flyctl deploy
```
Then point the game at it via the `TURN_*` env vars. (coturn config is beyond this
file — ask if you want the full fly.toml + turnserver.conf.)

## Recommended hosting for CR: Fly.io `qro` (Querétaro, Mexico)

Render is US-only. Fly's `qro` region is the closest to Costa Rica, so the
WebSocket handshake and any relay fallback are much faster. Config is in
[`fly.toml`](fly.toml) (region `qro`, one always-warm machine = no cold start).

```bash
# one time
npm i -g flyctl        # or: curl -L https://fly.io/install.sh | sh
flyctl auth login
# from the mini-soccer folder (fly.toml + Dockerfile are already here)
flyctl launch --copy-config --no-deploy   # accept app name / region qro
flyctl deploy
```
Gives an https URL like `https://huateque-mini-futbol.fly.dev`. Point the table
QRs at it.

## TL;DR
- **Sub-60ms** = direct P2P on the **same WiFi**. Already works — just confirm the P2P badge.
- Host on **Fly `qro`** (closer than Render) for fast handshake + regional fallback.
- Add **TURN** (env vars) only for connectivity on hostile networks — it won't be sub-60, but it keeps games from failing to connect.
