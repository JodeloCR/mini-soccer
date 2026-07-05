// Self-service admin panel: /?admin=KEY — edit brand + rules at runtime and
// see usage stats. No code, no redeploy (values live in server data.json).

import { BRAND, PROMO, RULES } from "../config";

interface PromoOverride {
  enabled?: boolean;
  rewardText?: string;
  consolationText?: string;
  validDays?: number;
}
interface Overrides {
  brand?: Record<string, string>;
  winGoals?: number;
  promo?: PromoOverride;
}
interface Stats {
  matches: number;
  goals: number;
  coupons?: { issued: number; redeemed: number };
}

export async function renderAdmin(root: HTMLElement, key: string) {
  document.body.classList.add("print-mode"); // reuse scrollable light-page mode
  let overrides: Overrides = {};
  let stats: Stats | null = null;
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
  const promo = { ...overrides.promo };
  const couponsIssued = stats.coupons?.issued ?? 0;
  const couponsRedeemed = stats.coupons?.redeemed ?? 0;
  root.innerHTML = `
    <div class="admin-page">
      <div class="card admin-card">
        <div class="subtitle">Panel — ${BRAND.name}</div>
        <div class="admin-stats">📊 <b>${stats.matches}</b> partidas · <b>${stats.goals}</b> goles
          · 🎟️ ${couponsIssued} cupones (${couponsRedeemed} canjeados)
          <small>(se reinicia si el hosting redeploya)</small></div>
        <label>Nombre <input id="f-name" value="${v("name", BRAND.name)}" maxlength="30"></label>
        <label>Tagline <input id="f-tagline" value="${v("tagline", BRAND.tagline)}" maxlength="40"></label>
        <label>Color acento <input id="f-accent" type="color" value="${v("accent", BRAND.accent)}"></label>
        <label>Goles para ganar <input id="f-goals" type="number" min="1" max="20"
          value="${overrides.winGoals ?? RULES.winGoals}"></label>
        <label><input id="f-promo-enabled" type="checkbox" ${promo.enabled ?? PROMO.enabled ? "checked" : ""}>
          Cupón al ganador</label>
        <label>Premio <input id="f-promo-reward" value="${promo.rewardText ?? PROMO.rewardText}" maxlength="120"></label>
        <label>Consuelo al perdedor (opcional)
          <input id="f-promo-consolation" value="${promo.consolationText ?? PROMO.consolationText}" maxlength="120"></label>
        <label>Días de vigencia <input id="f-promo-days" type="number" min="1" max="60"
          value="${promo.validDays ?? PROMO.validDays}"></label>
        <button class="big-btn" id="save">Guardar</button>
        <p class="hint" id="msg"></p>
        <div class="subtitle" style="font-size:18px;margin-top:20px">Verificar cupón</div>
        <label>Código <input id="f-redeem-code" placeholder="ABC-123" maxlength="7"></label>
        <button class="big-btn" id="redeem">Canjear</button>
        <p class="hint" id="redeem-msg"></p>
      </div>
    </div>`;

  const get = (id: string) => (root.querySelector(id) as HTMLInputElement).value;
  const getChecked = (id: string) => (root.querySelector(id) as HTMLInputElement).checked;
  (root.querySelector("#save") as HTMLElement).onclick = async () => {
    const msg = root.querySelector("#msg") as HTMLElement;
    try {
      const r = await fetch(`/config?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: { name: get("#f-name"), tagline: get("#f-tagline"), accent: get("#f-accent") },
          winGoals: Number(get("#f-goals")),
          promo: {
            enabled: getChecked("#f-promo-enabled"),
            rewardText: get("#f-promo-reward"),
            consolationText: get("#f-promo-consolation"),
            validDays: Number(get("#f-promo-days")),
          },
        }),
      });
      msg.textContent = r.ok ? "✅ Guardado — los próximos partidos usan esto" : "❌ Clave rechazada";
    } catch {
      msg.textContent = "❌ Sin conexión al servidor";
    }
  };

  (root.querySelector("#redeem") as HTMLElement).onclick = async () => {
    const msg = root.querySelector("#redeem-msg") as HTMLElement;
    const code = get("#f-redeem-code");
    try {
      const r = await fetch(`/promo/redeem?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (r.status === 403) {
        msg.textContent = "❌ Clave rechazada";
        return;
      }
      const data = await r.json();
      if (data.status === "ok") msg.textContent = `✅ Válido: ${data.rewardText} — marcado como canjeado`;
      else if (data.status === "used") msg.textContent = "⚠️ Ya fue canjeado";
      else if (data.status === "expired") msg.textContent = "⌛ Vencido";
      else msg.textContent = "❌ No existe";
    } catch {
      msg.textContent = "❌ Sin conexión al servidor";
    }
  };
}
