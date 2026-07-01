# Roadmap: Game Feel + Restaurant Value

Objetivo: que el juego se sienta *delicioso* de jugar, y que Huateque tenga
razones de negocio para pagarlo (marketing, visitas repetidas, upsell).

---

## Fase 1 — Juice core (máximo impacto de "feel" por hora)

| # | Qué | Cómo | Esfuerzo |
|---|-----|------|----------|
| 1 | **Sonido** | WebAudio sintetizado (sin assets): golpe seco al KICK, "pop" en rebote de pared, bocina + gritos "¡GOOOL!" en gol, beeps de cuenta regresiva, sting de mariachi al ganar. Desbloquear audio en el primer toque (requisito móvil). | 2–3 h |
| 2 | **Háptica** | `navigator.vibrate` en kick (20ms) y gol (100ms). Android sí; iOS Safari no lo soporta — degradación silenciosa. | 15 min |
| 3 | **Screen shake + zoom punch** | Sacudida de cámara ~200ms en gol y kick fuerte; micro-zoom al marcar. En `scene.render()` con offset decay. | 1 h |
| 4 | **Estela de la pelota + partículas** | Trail que aparece sobre cierta velocidad; chispas al conectar un kick. Sprites baratos, pool fijo (móvil). | 2 h |
| 5 | **Orientación del jugador** | Rotar mesh hacia dirección de movimiento; inclinarse en dash (ya hay squash-stretch). | 1 h |

## Fase 2 — Celebración de gol (el momento que importa)

| # | Qué | Cómo | Esfuerzo |
|---|-----|------|----------|
| 6 | **Slow-mo de gol** | 0.4× por 0.5s al cruzar la línea (efecto de render; el sim ya congela en fase `goal`). | 2 h |
| 7 | **Confeti + red que ondula** | Burst de confeti con colores del equipo que anotó; ripple en la red. | 2 h |
| 8 | **Texto GOOOL con más punch** | Escala elástica, colores del equipo, contador de racha ("¡3 seguidos!"). | 1 h |

## Fase 3 — Lo que el restaurante paga (negocio)

| # | Qué | Por qué pagan | Esfuerzo |
|---|-----|---------------|----------|
| 9 | **Tarjeta de resultado compartible** | Canvas → imagen → Web Share API: "Perdí en Huateque, ¡pago la cuenta! 😭" con logo + marcador. Cada derrota = post gratis en redes = marketing orgánico. | 3 h |
| 10 | **Leaderboard semanal** | Nickname al ganar → top-10 de la semana en pantalla de lobby. Gancho: "el campeón de la semana gana postre gratis" → visitas repetidas. ⚠️ Necesita persistencia: disco de Render (pago) o DB externa free (Turso/Neon). | 4–6 h |
| 11 | **Hooks de promo** | Pantalla de victoria muestra upsell del platillo del equipo ("Pedí el Guacamole de la victoria 🥑"). Cada N goles globales → código de cupón en pantalla. Configurable. | 2 h |
| 12 | **Panel admin** | `/admin?key=...`: editar colores, textos, metas de gol, promos sin tocar código. El restaurante se auto-gestiona. | 4 h |
| 13 | **Modo attract** | Si nadie juega, partido demo IA vs IA detrás del lobby — en una tablet en la barra se ve vivo, invita a jugar. | 3 h |
| 14 | **PDF de stickers QR** | Generador de hoja imprimible: QR + logo + "Retá a tu amigo, el que pierde paga" por mesa. Entregable físico inmediato. | 2 h |
| 15 | **Contador de partidas** | Métrica simple (partidas/día, goles totales) visible en admin — demuestra al dueño que la gente lo usa (justifica lo pagado). | 2 h |

## Orden recomendado

1. Fase 1 completa (un día de trabajo, transforma el feel).
2. #9 tarjeta compartible (el multiplicador de marketing más barato).
3. #14 stickers QR (entregable físico para cerrar la venta).
4. Fase 2 (celebración).
5. #10 leaderboard + #11 promos (retención/upsell — vender como "plan Pro").
6. #12 admin + #13 attract + #15 métricas.

## Ángulo de venta al restaurante

- **Base**: juego brandeado + QRs de mesa + tarjeta compartible → entretenimiento
  en mesa + marketing orgánico, cero apps.
- **Pro**: leaderboard semanal + promos/cupones + panel admin + métricas →
  visitas repetidas y upsell medibles.
- Pitch: "convierte la espera de la comida en marketing: cada partida termina en
  un post de redes o un premio que trae al cliente de vuelta".

## Notas técnicas

- Todo el juice es client-side (scene.ts / hud.ts / style.css) — no toca netcode.
- Audio: sintetizar con osciladores WebAudio evita assets y pesa 0 KB.
- Partículas: pool fijo (~100 sprites) para no matar GPU de teléfono.
- Leaderboard: único ítem que exige persistencia real; el resto corre en el free tier actual.
