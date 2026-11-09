// Denetim: KVKK özeti kartları + filtreli, sayfalı denetim günlüğü.
import { api } from "../api.js";
import { emptyState, fill, fmt, h, icon, loading, notice, pageHead, statusBadge, table } from "../components.js";

const PAGE = 50;
const f = { module: "", user: "", from: "", to: "", offset: 0 };

function qs(extra = {}) {
  const p = new URLSearchParams();
  const all = { ...f, ...extra };
  for (const k of ["module", "user", "from", "to"]) if (all[k]) p.set(k, all[k]);
  return p;
}

export async function render(main) {
  fill(main, pageHead("Denetim Günlüğü", "Her modül çağrısı kaydedilir; içerik değil, yalnız özet ve özet değeri (hash) tutulur."), loading());
  const summaryBox = h("div", {});
  const listBox = h("div", {});
  const modSel = h("select", { id: "f-module", "aria-label": "Modül" }, h("option", { value: "" }, "Tüm modüller"));
  const from = h("input", { type: "date", id: "f-from", value: f.from, "aria-label": "Başlangıç tarihi" });
  const to = h("input", { type: "date", id: "f-to", value: f.to, "aria-label": "Bitiş tarihi" });
  const user = h("input", { type: "search", id: "f-user", value: f.user, placeholder: "Kullanıcı", "aria-label": "Kullanıcı" });
  const apply = h("button", { type: "submit", class: "btn primary" }, "Uygula");
  const form = h("form", { class: "toolbar", "aria-label": "Denetim filtresi" },
    h("label", { for: "f-module" }, "Modül"), modSel, h("label", { for: "f-from" }, "Başlangıç"), from, h("label", { for: "f-to" }, "Bitiş"), to, user, apply);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    Object.assign(f, { module: modSel.value, from: from.value, to: to.value, user: user.value.trim(), offset: 0 });
    load();
  });
  const refresh = h("button", { type: "button", class: "btn", onclick: () => load() }, icon("refresh"), "Yenile");
  fill(main, pageHead("Denetim Günlüğü", "Her modül çağrısı kaydedilir; içerik değil, yalnız özet ve özet değeri (hash) tutulur.", refresh),
    summaryBox, h("h2", {}, "Kayıtlar"), form, listBox);

  async function load() {
    fill(summaryBox, loading("Özet hazırlanıyor…"));
    fill(listBox, loading());
    const sp = qs();
    const [sum, list] = await Promise.all([
      api.get(`/api/audit/summary?${new URLSearchParams([...sp].filter(([k]) => k === "from" || k === "to"))}`).catch(() => null),
      api.get(`/api/audit?${sp}&limit=${PAGE}&offset=${f.offset}`).catch(() => null),
    ]);
    if (sum && sum.available === false) {
      fill(summaryBox, notice("Denetim günlüğü paketi (KVKK Kalkanı) yüklü değil; kayıt tutulmuyor.", "warn"));
    } else if (sum) {
      fill(summaryBox, 
        h("div", { class: "stats" },
          stat(fmt.num(sum.total_calls, 0), "Toplam çağrı"),
          stat(fmt.num(sum.masked_entities_total ?? sum.masked_entities, 0), "Maskelenen kişisel veri"),
          stat(fmt.num(sum.errors_total ?? sum.errors, 0), "Hatalı çağrı")),
        table([
          { key: "module", label: "Modül" },
          { key: "calls", label: "Çağrı", num: true, render: (r) => fmt.num(r.calls, 0) },
          { key: "masked_entities", label: "Maskelenen", num: true, render: (r) => fmt.num(r.masked_entities, 0) },
          { key: "errors", label: "Hata", num: true, render: (r) => fmt.num(r.errors, 0) },
          { key: "avg_duration_ms", label: "Ort. süre", num: true, render: (r) => (r.avg_duration_ms !== undefined ? `${fmt.num(r.avg_duration_ms, 0)} ms` : "—") },
        ], sum.modules || [], { caption: "Modül başına KVKK özeti", empty: "Seçilen dönemde çağrı yok." }));
    } else fill(summaryBox, emptyState("Özet alınamadı."));

    if (!list) { fill(listBox, emptyState("Kayıtlar alınamadı.")); return; }
    if (list.modules && modSel.options.length === 1) {
      list.modules.forEach((m) => modSel.append(h("option", { value: m, selected: f.module === m }, m)));
    }
    const total = list.total || 0;
    const prev = h("button", { type: "button", class: "btn small", disabled: f.offset === 0, onclick: () => { f.offset = Math.max(0, f.offset - PAGE); load(); } }, "Önceki");
    const next = h("button", { type: "button", class: "btn small", disabled: f.offset + PAGE >= total, onclick: () => { f.offset += PAGE; load(); } }, "Sonraki");
    fill(listBox, 
      table([
        { key: "ts", label: "Zaman", render: (r) => fmt.date(r.ts) },
        { key: "user", label: "Kullanıcı" },
        { key: "module", label: "Modül" },
        { key: "action", label: "Eylem", render: (r) => h("code", {}, r.action) },
        { key: "model", label: "Model" },
        { key: "masked_entities", label: "Maskelenen", num: true },
        { key: "duration_ms", label: "Süre", num: true, render: (r) => `${fmt.num(r.duration_ms, 0)} ms` },
        { key: "status", label: "Durum", render: (r) => statusBadge(r.status) },
        { key: "error", label: "Hata" },
        { key: "payload_hash", label: "Özet", render: (r) => (r.payload_hash ? h("code", {}, r.payload_hash) : "—") },
      ], list.items || [], { caption: "Denetim kayıtları", empty: "Bu filtreye uyan kayıt yok." }),
      total > PAGE ? h("div", { class: "row", style: "margin-top:.6rem" }, prev,
        h("span", {}, `${f.offset + 1}–${Math.min(f.offset + PAGE, total)} / ${total}`), next) : null);
  }
  load();
}

function stat(value, label) {
  return h("div", { class: "card stat" }, h("span", { class: "value" }, value), h("span", { class: "label" }, label));
}
