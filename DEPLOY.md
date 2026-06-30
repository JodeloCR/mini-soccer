# Cómo publicar el juego y entregárselo al cliente

El juego es **una sola app**: un servidor Node sirve la web + el WebSocket. Lo
subís a un hosting, te da una **URL pública (https)**, y esa URL es el juego. El
cliente solo necesita esa URL — los jugadores la abren o escanean el QR.

---

## Opción A — Render (recomendada, gratis)

### 1. Subir el código a GitHub
```bash
cd mini-soccer
git remote add origin https://github.com/TU_USUARIO/mini-soccer.git
git push -u origin main
```
(Si no tenés repo: creá uno vacío en github.com, sin README, y corré lo de arriba.)

### 2. Crear el servicio en Render
1. Entrá a https://render.com y registrate (gratis, con GitHub).
2. **New +** → **Blueprint** → elegí el repo `mini-soccer`.
   - Render lee `render.yaml` y configura todo solo (build + start + health check).
   - Si preferís manual: **New +** → **Web Service** →
     - Build command: `npm install && npm run build`
     - Start command: `npm start`
3. **Deploy**. En ~2 min te da una URL tipo `https://huateque-mini-futbol.onrender.com`.

### 3. Probar
Abrí la URL en el teléfono → **Crear partida** → el otro escanea el QR. Listo.

> ⚠️ Plan **free** se "duerme" tras ~15 min sin uso (la primera carga tarda ~30s).
> Para uso diario en el local, subí a plan **Starter** (siempre activo) en la
> config del servicio.

---

## Opción B — Sin GitHub (Railway o Fly.io)

- **Railway** (https://railway.app): New Project → Deploy from local / GitHub →
  detecta Node. Mismos comandos: build `npm run build`, start `npm start`.
- **Fly.io** (CLI, free siempre-activo):
  ```bash
  npm i -g flyctl
  fly launch        # detecta Node; aceptá; build npm run build, start npm start
  fly deploy
  ```

---

## Entregar al cliente (Huateque)

1. **La URL** del deploy (ej. `https://huateque-mini-futbol.onrender.com`).
2. **Stickers QR para las mesas**: generá un QR de esa URL (qr-code-generator.com
   o el de tu impresora) y pegalo en cada mesa con el texto:
   *"Escaneá, creá partida y retá a tu amigo — el que pierde paga la cuenta."*
3. (Opcional) **Dominio propio**: en Render → Settings → Custom Domain, podés usar
   algo como `futbol.huateque.cr`.

### Personalizar marca antes de entregar
- Logo: poné un PNG transparente en `public/logo.png` (aparece en el círculo central).
- Colores/equipos/reglas: `src/config.ts` (`BRAND`, `TEAMS`, `RULES.winGoals`).
- Tras cambios: `git push` → Render redeploya solo (autoDeploy).

---

## Checklist de release
```bash
npm run typecheck   # sin errores de tipos
npm test            # física + reglas
npm run build       # genera dist/
npm start           # probar local: http://localhost:8080
```
Todo verde = listo para subir.
