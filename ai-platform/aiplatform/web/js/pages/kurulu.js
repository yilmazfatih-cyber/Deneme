// Kurulu modüller: etkin/pasif, sağlık, kaldır, "Dene" paneli.
import { api, asList } from "../api.js";
import { badge, confirmDialog, emptyState, fill, fmt, h, icon, loading, notice, openDrawer, pageHead, pretty, toast } from "../components.js";

const EXAMPLES = {
  "finans-hesap": {
    payback: { investment: 100, cash_flows: [30, 30, 30, 30, 30], rate: 0.1 },
    npv_irr: { rate: 0.12, cash_flows: [-1000, 300, 400, 500, 200] },
    amortization: { principal: 500000, annual_rate: 0.42, months: 24 },
    cashflow_projection: { months: 12, opening_balance: 250000, inflows: [180000], outflows: [165000] },
    ask: { question: "100 bin TL yatırım yıllık 30 bin TL getirirse geri ödeme süresi kaç yıl?" },
  },
  "kvkk-kalkani": {
    mask: { text: "Ayşe Örnek'in telefonu 0500 000 00 00, e-postası ornek@ornek.test" },
    scan: { text: "IBAN: TR00 0000 0000 0000 0000 0000 00" },
  },
};

function skeleton(schema) {
  if (!schema || typeof schema !== "object") return {};
  const props = schema.properties || {};
  const req = schema.required || Object.keys(props);
  const out = {};
  for (const k of req) {
    const p = props[k] || {};
    out[k] = p.default !== undefined ? p.default
      : p.enum ? p.enum[0]
        : p.type === "number" || p.type === "integer" ? 0
          : p.type === "array" ? []
            : p.type === "boolean" ? false
              : p.type === "object" ? {} : "";
  }
  return out;
}

export async function render(main) {
  fill(main, pageHead("Kurulu Modüller", "Bu platformda kurulu modüllerin durumu."), loading());
  let items;
  try {
    items = asList(await api.get("/api/modules"));
  } catch {
    fill(main, pageHead("Kurulu Modüller"), emptyState("Kurulu modül listesi alınamadı."));
    return;
  }
  const refresh = h("button", { type: "button", class: "btn", onclick: () => render(main) }, icon("refresh"), "Yenile");
  if (!items.length) {
    fill(main, pageHead("Kurulu Modüller", "Bu platformda kurulu modüllerin durumu.", refresh),
      emptyState("Henüz kurulu modül yok.", h("a", { href: "#/magaza", class: "btn primary" }, "Mağazaya git")));
    return;
  }
  fill(main, pageHead("Kurulu Modüller", `${items.length} modül kurulu.`, refresh),
    h("div", { class: "grid" }, items.map((m) => moduleCard(m, main))));
}

function moduleCard(m, main) {
  const id = m.module_id || m.id;
  const health = m.health || {};
  const sw = h("input", { type: "checkbox", role: "switch", id: `en-${id}`, checked: !!m.enabled, "aria-checked": String(!!m.enabled) });
  sw.addEventListener("change", async () => {
    sw.disabled = true;
    try {
      await api.post(`/api/modules/${encodeURIComponent(id)}/${sw.checked ? "enable" : "disable"}`);
      sw.setAttribute("aria-checked", String(sw.checked));
      toast(sw.checked ? "Modül etkinleştirildi." : "Modül pasifleştirildi.", "ok");
    } catch {
      sw.checked = !sw.checked;
    } finally {
      sw.disabled = false;
    }
  });
  const removeBtn = h("button", { type: "button", class: "btn danger small" }, icon("trash"), "Kaldır");
  removeBtn.addEventListener("click", async () => {
    if (!(await confirmDialog(`"${m.name || id}" kaldırılsın mı? Başka modülün kullanmadığı model dosyaları silinir.`, { okText: "Kaldır", danger: true }))) return;
    removeBtn.disabled = true;
    try {
      await api.post(`/api/modules/${encodeURIComponent(id)}/uninstall`);
      toast("Modül kaldırıldı.", "ok");
      render(main);
    } catch (e) {
      removeBtn.disabled = false;
      if (e.code === "has_dependents" && (await confirmDialog(`${e.message} Yine de kaldırılsın mı?`, { okText: "Zorla kaldır", danger: true }))) {
        await api.post(`/api/modules/${encodeURIComponent(id)}/uninstall?force=true`).then(() => render(main)).catch(() => {});
      }
    }
  });
  const tryBtn = h("button", { type: "button", class: "btn small" }, icon("play"), "Dene");
  tryBtn.addEventListener("click", () => openTry(id, m.name || id));
  const healthBadge = health.ready ? badge("Hazır", "ok") : badge("Hazır değil", "warn", { title: health.error || "" });
  return h("div", { class: "card" },
    h("div", { class: "row" }, h("div", { class: "title grow" }, m.name || id), healthBadge),
    h("div", { class: "meta" }, badge(id, "code"), badge(m.target === "client" ? "Bilgisayar" : m.target === "server" ? "Sunucu" : m.target || "—"),
      m.running ? badge("Çalışıyor", "ok") : null),
    !health.ready && health.error ? h("p", { style: "font-size:.85rem;color:var(--muted)" }, health.error) : null,
    h("p", { style: "font-size:.85rem;color:var(--muted)" }, `Kurulum: ${fmt.date(m.installed_at)}`),
    h("div", { class: "row" }, h("label", { class: "check", for: `en-${id}` }, sw, "Etkin"), h("span", { class: "grow" }), tryBtn, removeBtn));
}

async function openTry(id, name) {
  const body = openDrawer(`Dene: ${name}`, loading());
  let spec;
  try {
    spec = await api.get(`/api/catalog/modules/${encodeURIComponent(id)}`);
  } catch {
    fill(body, emptyState("Modül bilgisi alınamadı."));
    return;
  }
  const actions = spec.actions || [];
  const sel = h("select", { id: "try-action" }, actions.map((a) => h("option", { value: a.id }, `${a.name} (${a.id})${a.human_approval ? " — onay gerekir" : ""}`)));
  const ta = h("textarea", { id: "try-body", spellcheck: "false", "aria-describedby": "try-help" });
  const fileBox = h("div", {});
  const out = h("div", { "aria-live": "polite" });
  const desc = h("p", { style: "color:var(--muted)" });
  function fillExample() {
    const a = actions.find((x) => x.id === sel.value);
    desc.textContent = a ? a.description : "";
    const ex = (EXAMPLES[id] || {})[sel.value] || skeleton(a && a.input_schema);
    const fileProps = Object.entries((a && a.input_schema && a.input_schema.properties) || {}).filter(([, p]) => p && p.format === "binary").map(([k]) => k);
    for (const k of fileProps) delete ex[k];
    ta.value = JSON.stringify(ex, null, 2);
    fill(fileBox, ...fileProps.map((k) => h("div", { class: "field" }, h("label", { for: `file-${k}` }, `Dosya: ${k}`), h("input", { type: "file", id: `file-${k}`, dataset: { field: k } }))));
  }
  sel.addEventListener("change", fillExample);
  fillExample();
  const run = h("button", { type: "button", class: "btn primary" }, icon("play"), "Çalıştır");
  run.addEventListener("click", async () => {
    let payload;
    try {
      payload = JSON.parse(ta.value || "{}");
    } catch (e) {
      fill(out, notice(`JSON gövdesi geçersiz: ${e.message}`, "fail"));
      return;
    }
    run.disabled = true;
    fill(out, loading("Çalışıyor…"));
    const url = `/api/modules/${encodeURIComponent(id)}/run/${encodeURIComponent(sel.value)}`;
    const files = [...fileBox.querySelectorAll("input[type=file]")].filter((i) => i.files.length);
    try {
      let res;
      if (files.length) {
        const fd = new FormData();
        for (const [k, v] of Object.entries(payload)) fd.append(k, typeof v === "string" ? v : JSON.stringify(v));
        files.forEach((i) => fd.append(i.dataset.field, i.files[0]));
        const r = await fetch(url, { method: "POST", body: fd });
        res = await r.json();
        if (!r.ok) throw Object.assign(new Error((res.error && res.error.message) || "İstek başarısız"), { hint: res.error && res.error.hint });
      } else {
        res = await api.post(url, payload, { quiet: true });
      }
      const meta = res.meta || {};
      fill(out, 
        res.approval_id ? notice(`İşlem onay kuyruğuna alındı (onay: ${res.approval_id}).`, "warn") : null,
        h("dl", { class: "kv" },
          h("dt", {}, "Model"), h("dd", {}, meta.model || "—"),
          h("dt", {}, "Süre"), h("dd", {}, meta.duration_ms !== undefined ? `${fmt.num(meta.duration_ms, 0)} ms` : "—"),
          h("dt", {}, "Maskelenen varlık"), h("dd", {}, meta.masked_entities !== undefined ? String(meta.masked_entities) : "—")),
        h("h3", {}, "Sonuç"), pretty(res.result !== undefined ? res.result : res));
    } catch (e) {
      fill(out, notice(e.message, "fail", "Çalıştırılamadı."), e.hint ? h("p", { style: "color:var(--muted)" }, `İpucu: ${e.hint}`) : null);
    } finally {
      run.disabled = false;
    }
  });
  fill(body, 
    h("div", { class: "field" }, h("label", { for: "try-action" }, "Eylem"), sel), desc,
    h("div", { class: "field" }, h("label", { for: "try-body" }, "JSON gövde"), ta,
      h("small", { id: "try-help" }, "Gövde eylemin giriş şemasına uymalı. Kişisel veri içeren metinler KVKK Kalkanı'ndan geçer.")),
    fileBox, h("div", { class: "row" }, run), out);
}
