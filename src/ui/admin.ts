// Self-service admin panel: /?admin=KEY — edit brand + rules at runtime and
// see usage stats. No code, no redeploy (values live in server data.json).

import { BRAND, RULES } from "../config";

export async function renderAdmin(root: HTMLElement, key: string) {
  document.body.classList.add("print-mode"); // reuse scrollable light-page mode
  let overrides: { brand?: Record<string, string>; winGoals?: number } = {};
  let stats: { matches: number; goals: number } | null = null;
  try {
    overrides = await (await fetch("/config")).json();
    const r = await fetch(`/stats?key=${encodeURIComponent(key)}`);
    if (r.ok) stats = await r.json();
  } catch {
    /* offline — form still renders with defaults */
  }
  if (!stats) {
    root.innerHTML = `<div class="admin-page"><div class="card"><div class="subtitle">Clave incorrecta</div>
      <p class="hint">Abrí /?admin=TU_CLAVE (env ADMIN_KEY del servidor).</p></div></div>`;
    return;
  }

  const b = { ...overrides.brand };
  const v = (k: string, dflt: string) => b[k] ?? dflt;
  root.innerHTML = `
    <div class="admin-page">
      <div class="card admin-card">
        <div class="subtitle">Panel — ${BRAND.name}</div>
        <div class="admin-stats">📊 <b>${stats.matches}</b> partidas · <b>${stats.goals}</b> goles
          <small>(se reinicia si el hosting redeploya)</small></div>
        <label>Nombre <input id="f-name" value="${v("name", BRAND.name)}" maxlength="30"></label>
        <label>Tagline <input id="f-tagline" value="${v("tagline", BRAND.tagline)}" maxlength="40"></label>
        <label>Color acento <input id="f-accent" type="color" value="${v("accent", BRAND.accent)}"></label>
        <label>Goles para ganar <input id="f-goals" type="number" min="1" max="20"
          value="${overrides.winGoals ?? RULES.winGoals}"></label>
        <button class="big-btn" id="save">Guardar</button>
        <p class="hint" id="msg"></p>
      </div>
    </div>`;

  const get = (id: string) => (root.querySelector(id) as HTMLInputElement).value;
  (root.querySelector("#save") as HTMLElement).onclick = async () => {
    const msg = root.querySelector("#msg") as HTMLElement;
    try {
      const r = await fetch(`/config?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: { name: get("#f-name"), tagline: get("#f-tagline"), accent: get("#f-accent") },
          winGoals: Number(get("#f-goals")),
        }),
      });
      msg.textContent = r.ok ? "✅ Guardado — los próximos partidos usan esto" : "❌ Clave rechazada";
    } catch {
      msg.textContent = "❌ Sin conexión al servidor";
    }
  };
}
